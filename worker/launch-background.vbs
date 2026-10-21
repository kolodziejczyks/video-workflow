Option Explicit
Dim shell, files, root, nodePath, mode, command
If WScript.Arguments.Count <> 2 Then WScript.Quit 2
mode = WScript.Arguments(0)
nodePath = WScript.Arguments(1)
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
root = files.GetParentFolderName(files.GetParentFolderName(WScript.ScriptFullName))
shell.CurrentDirectory = root
Select Case mode
    Case "worker"
        command = Quote(shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe") & " -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File " & Quote(root & "\worker\start-background.ps1") & " -NodePath " & Quote(nodePath)
    Case "cleanup"
        command = Quote(nodePath) & " " & Quote(root & "\scripts\finish_capcut_upload.mjs")
    Case Else
        WScript.Quit 2
End Select
' GUI-subsystem wscript allocates no console. Hide the child from creation,
' and wait so Task Scheduler's IgnoreNew and exit-code handling still work.
WScript.Quit shell.Run(command, 0, True)

Function Quote(value)
    If InStr(value, Chr(34)) > 0 Then WScript.Quit 2
    Quote = Chr(34) & value & Chr(34)
End Function
