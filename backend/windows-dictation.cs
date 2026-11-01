// Fixed Win+H launcher. No speech/audio access and no configurable keystrokes.
using System;
using System.Globalization;
using System.Runtime.InteropServices;

internal static class WindowsDictation
{
    [StructLayout(LayoutKind.Sequential)]
    struct KeyboardInput { public ushort key, scan; public uint flags, time; public UIntPtr extra; }
    [StructLayout(LayoutKind.Sequential)]
    struct MouseInput { public int x, y; public uint data, flags, time; public UIntPtr extra; }
    [StructLayout(LayoutKind.Explicit)]
    struct InputData { [FieldOffset(0)] public KeyboardInput keyboard; [FieldOffset(0)] public MouseInput mouse; }
    [StructLayout(LayoutKind.Sequential)]
    struct Input { public uint type; public InputData data; }

    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll", SetLastError=true)] static extern uint SendInput(uint count, Input[] input, int size);

    static Input Key(ushort key, bool up)
    {
        return new Input { type=1, data=new InputData { keyboard=new KeyboardInput {
            key=key, flags=(up ? 2u : 0u) | (key==0x5B ? 1u : 0u)
        } } };
    }

    [STAThread]
    static int Main(string[] args)
    {
        if (args.Length==1 && args[0]=="--self-test")
            return IntPtr.Size==8 && Marshal.SizeOf(typeof(Input))==40 ? 0 : 2;
        ulong handle;
        uint expectedProcess;
        if (args.Length!=3 || args[0]!="--dictate" ||
            !UInt64.TryParse(args[1], NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture, out handle) ||
            handle==0 || handle>Int64.MaxValue ||
            !UInt32.TryParse(args[2], NumberStyles.None, CultureInfo.InvariantCulture, out expectedProcess) || expectedProcess==0)
            return 2;
        IntPtr window=new IntPtr((long)handle);
        uint actualProcess;
        if (GetWindowThreadProcessId(window, out actualProcess)==0 || actualProcess!=expectedProcess || GetForegroundWindow()!=window)
            return 3;
        // Never release or combine with keys the user is currently holding.
        foreach (int key in new int[] { 0x10, 0x11, 0x12, 0x5B, 0x5C, 0x48 })
            if ((GetAsyncKeyState(key) & 0x8000)!=0) return 4;
        if (GetForegroundWindow()!=window) return 3;
        Input[] keys={ Key(0x5B,false), Key(0x48,false), Key(0x48,true), Key(0x5B,true) };
        if (SendInput((uint)keys.Length, keys, Marshal.SizeOf(typeof(Input)))==keys.Length) return 0;
        // A partial insertion must not leave our initially unpressed keys held.
        Input[] release={ Key(0x48,true), Key(0x5B,true) };
        SendInput((uint)release.Length, release, Marshal.SizeOf(typeof(Input)));
        return 5;
    }
}
