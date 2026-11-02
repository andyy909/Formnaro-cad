param([Parameter(Mandatory=$true)][int]$TargetProcessId)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class CncProcessLimit {
 [StructLayout(LayoutKind.Sequential)] public struct Basic {
  public long ProcessTime, JobTime; public uint Flags;
  public UIntPtr MinWorkingSet, MaxWorkingSet; public uint ActiveProcesses;
  public UIntPtr Affinity; public uint Priority, Scheduling;
 }
 [StructLayout(LayoutKind.Sequential)] public struct Io { public ulong ReadOps, WriteOps, OtherOps, ReadBytes, WriteBytes, OtherBytes; }
 [StructLayout(LayoutKind.Sequential)] public struct Extended {
  public Basic Basic; public Io Io; public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
 }
 [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr security, string name);
 [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job, int info, ref Extended limits, uint size);
 [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
 [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr handle);
 public static IntPtr Attach(IntPtr process) {
  var job=CreateJobObject(IntPtr.Zero,null); if(job==IntPtr.Zero)throw new System.ComponentModel.Win32Exception();
  var limits=new Extended(); limits.Basic.Flags=0x100|0x2000; // process memory + kill owned processes on close
  limits.ProcessMemory=new UIntPtr(3UL*1024*1024*1024);
  if(!SetInformationJobObject(job,9,ref limits,(uint)Marshal.SizeOf(limits))||!AssignProcessToJobObject(job,process)) {
   int code=Marshal.GetLastWin32Error(); CloseHandle(job); throw new System.ComponentModel.Win32Exception(code);
  }
  return job;
 }
}
'@
$targetProcess = [System.Diagnostics.Process]::GetProcessById($TargetProcessId)
$jobHandle = [CncProcessLimit]::Attach($targetProcess.Handle)
try {
 Write-Output '{"type":"limit-ready","processCommitLimitBytes":3221225472}'
 while (-not $targetProcess.WaitForExit(500)) {
  $targetProcess.Refresh()
  Write-Output ('{"type":"process-memory","rss":' + $targetProcess.WorkingSet64 + ',"privateBytes":' + $targetProcess.PrivateMemorySize64 + '}')
 }
} finally { [void][CncProcessLimit]::CloseHandle($jobHandle) }
