param(
    [Parameter(Mandatory)][ValidateSet('activate','double-click','close-window')][string]$Mode,
    [Parameter(Mandatory)][int64]$Handle,
    [Parameter(Mandatory)][int]$ExpectedPid,
    [Parameter(Mandatory)][string]$ExpectedClassPrefix,
    [int]$X = -1,
    [int]$Y = -1,
    [int]$MinimumIdleMs = 3000
)
# Three guarded desktop actions on one verified CapCut window. Every action re-reads the window
# by handle, PID and class immediately before acting; nothing is remembered between runs.
# double-click injects two left clicks at a point inside the verified foreground window and
# restores the cursor; close-window posts WM_CLOSE (the window's own close control), never a kill.
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class CapCutAct {
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
    [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public MOUSEINPUT mi; }
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder s, int n);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder s, int n);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int cmd);
    [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO info);
    [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern uint SendInput(uint n, INPUT[] inputs, int size);
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("kernel32.dll")] public static extern uint GetTickCount();
}
'@
[CapCutAct]::SetProcessDPIAware() | Out-Null
$h = [IntPtr]$Handle

function Read-Window {
    if (-not [CapCutAct]::IsWindow($h)) { throw 'Window no longer exists.' }
    $owner = [uint32]0; [CapCutAct]::GetWindowThreadProcessId($h, [ref]$owner) | Out-Null
    if ([int]$owner -ne $ExpectedPid) { throw "Window belongs to PID $owner, expected $ExpectedPid." }
    $c = New-Object System.Text.StringBuilder 256; [CapCutAct]::GetClassName($h, $c, 256) | Out-Null
    if (-not $c.ToString().StartsWith($ExpectedClassPrefix)) { throw "Window class '$($c.ToString())' is not '$ExpectedClassPrefix*'." }
    $t = New-Object System.Text.StringBuilder 512; [CapCutAct]::GetWindowText($h, $t, 512) | Out-Null
    $r = New-Object CapCutAct+RECT; [CapCutAct]::GetWindowRect($h, [ref]$r) | Out-Null
    return [pscustomobject]@{ handle = $Handle; pid = [int]$owner; class = $c.ToString(); title = $t.ToString();
        left = $r.Left; top = $r.Top; width = ($r.Right - $r.Left); height = ($r.Bottom - $r.Top);
        visible = [CapCutAct]::IsWindowVisible($h); minimized = [CapCutAct]::IsIconic($h); foreground = ([CapCutAct]::GetForegroundWindow() -eq $h) }
}
function Get-IdleMs { $i = New-Object CapCutAct+LASTINPUTINFO; $i.cbSize = 8; [CapCutAct]::GetLastInputInfo([ref]$i) | Out-Null; return [int]([CapCutAct]::GetTickCount() - $i.dwTime) }

$w = Read-Window
switch ($Mode) {
    'activate' {
        if ($w.minimized) { [CapCutAct]::ShowWindow($h, 9) | Out-Null }
        [CapCutAct]::SetForegroundWindow($h) | Out-Null
        Start-Sleep -Milliseconds 500
        @{ window = (Read-Window) } | ConvertTo-Json -Depth 4 -Compress
    }
    'double-click' {
        if ($X -lt 0 -or $Y -lt 0) { throw 'Coordinates are required.' }
        $idle = Get-IdleMs
        if ($idle -lt $MinimumIdleMs) { throw "User input $idle ms ago; refusing to inject clicks." }
        if (-not $w.foreground) { throw 'The verified window is not in the foreground.' }
        if ($X -lt $w.left -or $X -ge ($w.left + $w.width) -or $Y -lt $w.top -or $Y -ge ($w.top + $w.height)) { throw 'Point is outside the verified window.' }
        $p = New-Object CapCutAct+POINT; [CapCutAct]::GetCursorPos([ref]$p) | Out-Null
        [CapCutAct]::SetCursorPos($X, $Y) | Out-Null; Start-Sleep -Milliseconds 150
        $inputs = New-Object 'CapCutAct+INPUT[]' 4
        for ($i = 0; $i -lt 2; $i++) { $inputs[2*$i].mi.dwFlags = 0x0002; $inputs[2*$i+1].mi.dwFlags = 0x0004 }
        $sent = [CapCutAct]::SendInput(4, $inputs, [System.Runtime.InteropServices.Marshal]::SizeOf([type][CapCutAct+INPUT]))
        Start-Sleep -Milliseconds 300
        [CapCutAct]::SetCursorPos($p.X, $p.Y) | Out-Null
        @{ sent = ($sent -eq 4); x = $X; y = $Y; window = $w } | ConvertTo-Json -Depth 4 -Compress
    }
    'close-window' {
        $posted = [CapCutAct]::PostMessage($h, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)
        @{ posted = $posted; window = $w } | ConvertTo-Json -Depth 4 -Compress
    }
}
