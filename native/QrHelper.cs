using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using QRCoder;

namespace MyPcInput
{
    public static class QrHelper
    {
        public static Bitmap GenerateQrBitmap(string text, int pixelsPerModule = 5)
        {
            try
            {
                using (var qrGenerator = new QRCodeGenerator())
                using (var qrCodeData = qrGenerator.CreateQrCode(text, QRCodeGenerator.ECCLevel.M))
                using (var qrCode = new QRCode(qrCodeData))
                {
                    return qrCode.GetGraphic(pixelsPerModule, Color.Black, Color.White, true);
                }
            }
            catch (Exception ex)
            {
                var bmp = new Bitmap(180, 180);
                using (var g = Graphics.FromImage(bmp))
                {
                    g.Clear(Color.White);
                    using (var font = new Font("Segoe UI", 8F))
                    using (var brush = new SolidBrush(Color.Black))
                    {
                        g.DrawString("QR Generator Error:\n" + ex.Message, font, brush, new RectangleF(10, 10, 160, 160));
                    }
                }
                return bmp;
            }
        }

        public static byte[] GenerateQrPngBytes(string text, int pixelsPerModule = 5)
        {
            using (var bmp = GenerateQrBitmap(text, pixelsPerModule))
            using (var ms = new MemoryStream())
            {
                bmp.Save(ms, ImageFormat.Png);
                return ms.ToArray();
            }
        }
    }
}
