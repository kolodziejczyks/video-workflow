param(
    [string]$ImagePath = ''
)
# Read-only: enumerate visible CapCut windows, report user idle time and, when an image path is
# given, capture the largest non-minimized CapCut window and OCR it with Windows' built-in engine.
# No input is sent and no window state is changed.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class CapCutObserve {
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
    public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder s, int n);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder s, int n);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdc, uint flags);
    [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO info);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("kernel32.dll")] public static extern uint GetTickCount();
}
'@
[CapCutObserve]::SetProcessDPIAware() | Out-Null

function Get-CapCutWindows {
    $pids = @(Get-Process CapCut -ErrorAction SilentlyContinue | ForEach-Object { [uint32]$_.Id })
    $list = New-Object System.Collections.Generic.List[object]
    $fg = [CapCutObserve]::GetForegroundWindow()
    $cb = [CapCutObserve+EnumProc]{
        param($h, $l)
        $owner = [uint32]0
        [CapCutObserve]::GetWindowThreadProcessId($h, [ref]$owner) | Out-Null
        if ($pids -contains $owner -and [CapCutObserve]::IsWindowVisible($h)) {
            $t = New-Object System.Text.StringBuilder 512; [CapCutObserve]::GetWindowText($h, $t, 512) | Out-Null
            $c = New-Object System.Text.StringBuilder 256; [CapCutObserve]::GetClassName($h, $c, 256) | Out-Null
            $r = New-Object CapCutObserve+RECT; [CapCutObserve]::GetWindowRect($h, [ref]$r) | Out-Null
            # Win32 reports the generic Qt class; the QML page type (HomePageX_..., editor) is only visible through UI Automation.
            $role = ''; try { $role = [System.Windows.Automation.AutomationElement]::FromHandle($h).Current.ClassName } catch { $role = '' }
            $list.Add([pscustomobject]@{ handle = [int64]$h; pid = [int]$owner; title = $t.ToString(); class = $c.ToString(); role = $role;
                left = $r.Left; top = $r.Top; width = ($r.Right - $r.Left); height = ($r.Bottom - $r.Top);
                minimized = [CapCutObserve]::IsIconic($h); foreground = ($fg -eq $h) })
        }
        return $true
    }
    [CapCutObserve]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
    return @($list | Where-Object { $_.width -gt 100 -and $_.height -gt 100 })
}
function Get-IdleMs { $i = New-Object CapCutObserve+LASTINPUTINFO; $i.cbSize = 8; [CapCutObserve]::GetLastInputInfo([ref]$i) | Out-Null; return [int]([CapCutObserve]::GetTickCount() - $i.dwTime) }
function Capture-Window($w, $path) {
    $bmp = New-Object System.Drawing.Bitmap($w.width, $w.height)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $hdc = $g.GetHdc(); $ok = [CapCutObserve]::PrintWindow([IntPtr]$w.handle, $hdc, 2); $g.ReleaseHdc($hdc)
    if (-not $ok) { $g.CopyFromScreen($w.left, $w.top, 0, 0, $bmp.Size) }
    $g.Dispose(); $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
    return $ok
}
function Recognize-Text($path) {
    [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
    [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType = WindowsRuntime] | Out-Null
    [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
    function Await($op, $type) { $t = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
    $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($path)) ([Windows.Storage.StorageFile])
    $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
    if (-not $engine) { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage((New-Object Windows.Globalization.Language 'en')) }
    $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
    $stream.Dispose()
    $lines = foreach ($line in $result.Lines) {
        $words = @($line.Words | ForEach-Object { [pscustomobject]@{ text = ($_.Text -replace '[\x00-\x1f\x7f-\x9f]', ''); x = [int]$_.BoundingRect.X; y = [int]$_.BoundingRect.Y; w = [int]$_.BoundingRect.Width; h = [int]$_.BoundingRect.Height } })
        $x0 = ($words | Measure-Object x -Minimum).Minimum; $y0 = ($words | Measure-Object y -Minimum).Minimum
        $x1 = ($words | ForEach-Object { $_.x + $_.w } | Measure-Object -Maximum).Maximum; $y1 = ($words | ForEach-Object { $_.y + $_.h } | Measure-Object -Maximum).Maximum
        [pscustomobject]@{ text = ($line.Text -replace '[\x00-\x1f\x7f-\x9f]', ''); x = [int]$x0; y = [int]$y0; w = [int]($x1 - $x0); h = [int]($y1 - $y0); words = $words }
    }
    return @($lines)
}

$windows = Get-CapCutWindows
$report = [ordered]@{ windows = $windows; idleMs = (Get-IdleMs); foregroundIsCapCut = [bool]($windows | Where-Object { $_.foreground }); captured = $null; printWindow = $null; image = $null; lines = @() }
$main = @($windows | Where-Object { -not $_.minimized }) | Sort-Object { $_.width * $_.height } -Descending | Select-Object -First 1
if ($main -and $ImagePath) {
    $report.printWindow = Capture-Window $main $ImagePath
    $report.captured = $main.handle; $report.image = $ImagePath
    $report.lines = Recognize-Text $ImagePath
}
$report | ConvertTo-Json -Depth 6 -Compress
