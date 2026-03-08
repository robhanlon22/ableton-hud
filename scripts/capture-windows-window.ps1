param(
    [Parameter(Mandatory = $true)]
    [string]$WindowHandle,

    [Parameter(Mandatory = $true)]
    [string]$OutputPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class WindowCapture {
    public const int DWMWA_EXTENDED_FRAME_BOUNDS = 9;

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [DllImport("dwmapi.dll")]
    public static extern int DwmGetWindowAttribute(
        IntPtr hwnd,
        int dwAttribute,
        out RECT pvAttribute,
        int cbAttribute
    );

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool PrintWindow(IntPtr hwnd, IntPtr hdcBlt, uint nFlags);

    public static Rectangle GetBounds(IntPtr hwnd) {
        RECT rect;
        int hr = DwmGetWindowAttribute(
            hwnd,
            DWMWA_EXTENDED_FRAME_BOUNDS,
            out rect,
            Marshal.SizeOf<RECT>()
        );
        if (hr != 0) {
            if (!GetWindowRect(hwnd, out rect)) {
                throw new System.ComponentModel.Win32Exception(
                    Marshal.GetLastWin32Error(),
                    "GetWindowRect failed."
                );
            }
        }

        return Rectangle.FromLTRB(rect.Left, rect.Top, rect.Right, rect.Bottom);
    }

    public static void SaveWindowPng(IntPtr hwnd, string outputPath) {
        Rectangle bounds = GetBounds(hwnd);
        if (bounds.Width <= 0 || bounds.Height <= 0) {
            throw new InvalidOperationException("Window bounds are empty.");
        }

        using (Bitmap bitmap = new Bitmap(bounds.Width, bounds.Height)) {
            using (Graphics graphics = Graphics.FromImage(bitmap)) {
                IntPtr hdc = graphics.GetHdc();
                try {
                    if (!PrintWindow(hwnd, hdc, 0)) {
                        throw new System.ComponentModel.Win32Exception(
                            Marshal.GetLastWin32Error(),
                            "PrintWindow failed."
                        );
                    }
                } finally {
                    graphics.ReleaseHdc(hdc);
                }
            }

            bitmap.Save(outputPath, ImageFormat.Png);
        }
    }
}
"@

$parsedHandle = [Int64]::Parse($WindowHandle, [Globalization.CultureInfo]::InvariantCulture)
$windowPointer = [IntPtr]::new($parsedHandle)

[WindowCapture]::SaveWindowPng($windowPointer, $OutputPath)
