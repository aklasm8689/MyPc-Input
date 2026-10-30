using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;

namespace MyPcInput
{
    public class HttpServer
    {
        private TcpListener _listener;
        private Thread _listenThread;
        private volatile bool _isRunning;
        private readonly int _port;
        private readonly Dictionary<string, byte[]> _staticFiles = new Dictionary<string, byte[]>(StringComparer.OrdinalIgnoreCase);

        public bool IsRunning { get { return _isRunning; } }
        public int Port { get { return _port; } }

        public HttpServer(int port = 5000)
        {
            _port = port;
            LoadEmbeddedStaticFiles();
        }

        private void LoadEmbeddedStaticFiles()
        {
            try
            {
                var assembly = Assembly.GetExecutingAssembly();
                using (var stream = assembly.GetManifestResourceStream("dist.zip"))
                {
                    if (stream != null)
                    {
                        using (var zip = new ZipArchive(stream, ZipArchiveMode.Read))
                        {
                            foreach (var entry in zip.Entries)
                            {
                                if (string.IsNullOrEmpty(entry.Name)) continue; // Skip directory
                                using (var es = entry.Open())
                                using (var ms = new MemoryStream())
                                {
                                    es.CopyTo(ms);
                                    string key = entry.FullName.Replace('\\', '/').TrimStart('/');
                                    _staticFiles[key] = ms.ToArray();
                                }
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("Error extracting dist.zip: " + ex.Message);
            }
        }

        public void Start()
        {
            if (_isRunning) return;
            try
            {
                _listener = new TcpListener(IPAddress.Any, _port);
                _listener.Start();
                _isRunning = true;
                _listenThread = new Thread(ListenLoop) { IsBackground = true };
                _listenThread.Start();
            }
            catch (Exception ex)
            {
                _isRunning = false;
                throw ex;
            }
        }

        public void Stop()
        {
            _isRunning = false;
            try
            {
                if (_listener != null)
                {
                    _listener.Stop();
                    _listener = null;
                }
            }
            catch { }
        }

        private void ListenLoop()
        {
            while (_isRunning)
            {
                try
                {
                    var client = _listener.AcceptTcpClient();
                    ThreadPool.QueueUserWorkItem(HandleClient, client);
                }
                catch
                {
                    if (!_isRunning) break;
                }
            }
        }

        private void HandleClient(object obj)
        {
            var client = (TcpClient)obj;
            try
            {
                using (client)
                using (var stream = client.GetStream())
                {
                    stream.ReadTimeout = 5000;
                    var ms = new MemoryStream();
                    var buffer = new byte[8192];
                    int headerEnd = -1;
                    int contentLength = 0;

                    // Read HTTP request header
                    while (true)
                    {
                        int read = stream.Read(buffer, 0, buffer.Length);
                        if (read <= 0) break;
                        ms.Write(buffer, 0, read);

                        byte[] data = ms.ToArray();
                        headerEnd = FindHeaderEnd(data);
                        if (headerEnd != -1)
                        {
                            string headerStr = Encoding.UTF8.GetString(data, 0, headerEnd);
                            var match = Regex.Match(headerStr, @"Content-Length:\s*(\d+)", RegexOptions.IgnoreCase);
                            if (match.Success)
                            {
                                int.TryParse(match.Groups[1].Value, out contentLength);
                            }
                            int bodyRead = data.Length - (headerEnd + 4);
                            while (bodyRead < contentLength)
                            {
                                int r = stream.Read(buffer, 0, Math.Min(buffer.Length, contentLength - bodyRead));
                                if (r <= 0) break;
                                ms.Write(buffer, 0, r);
                                bodyRead += r;
                            }
                            break;
                        }
                    }

                    byte[] fullBytes = ms.ToArray();
                    if (headerEnd == -1) return;

                    string headerText = Encoding.UTF8.GetString(fullBytes, 0, headerEnd);
                    string[] lines = headerText.Split(new[] { "\r\n" }, StringSplitOptions.None);
                    if (lines.Length == 0) return;

                    string[] reqLine = lines[0].Split(' ');
                    if (reqLine.Length < 2) return;

                    string method = reqLine[0].ToUpperInvariant();
                    string rawUrl = reqLine[1];
                    string path = rawUrl.Split('?')[0];

                    string body = "";
                    if (contentLength > 0 && fullBytes.Length >= headerEnd + 4 + contentLength)
                    {
                        body = Encoding.UTF8.GetString(fullBytes, headerEnd + 4, contentLength);
                    }

                    // Handle CORS Preflight
                    if (method == "OPTIONS")
                    {
                        SendResponse(stream, 200, "OK", "text/plain", new byte[0]);
                        return;
                    }

                    // 1. Server Health & Info
                    if (path == "/health" || path == "/api/status" || path == "/api/info")
                    {
                        string lanIp = Program.GetLanIp();
                        string json = string.Format("{{\"status\":\"ok\",\"app\":\"MyPc-Input\",\"hostname\":\"{0}\",\"ip\":\"{1}\",\"port\":{2},\"lanUrl\":\"http://{1}:{2}\"}}",
                            ClipboardManager.EscapeJson(Environment.MachineName), lanIp, _port);
                        SendResponse(stream, 200, "OK", "application/json", Encoding.UTF8.GetBytes(json));
                        return;
                    }

                    // 2. Offline QR Code Generation Endpoint
                    if (path == "/api/qrcode" || path == "/api/qr")
                    {
                        string lanIp = Program.GetLanIp();
                        string qrData = string.Format("http://{0}:{1}", lanIp, _port);
                        byte[] pngBytes = QrHelper.GenerateQrPngBytes(qrData, 5);
                        SendResponse(stream, 200, "OK", "image/png", pngBytes);
                        return;
                    }

                    // 3. Clipboard API
                    if (path == "/api/clipboard" && method == "GET")
                    {
                        string json = ClipboardManager.GetHistoryJson();
                        SendResponse(stream, 200, "OK", "application/json", Encoding.UTF8.GetBytes(json));
                        return;
                    }

                    if (path == "/api/clipboard/clear" && method == "POST")
                    {
                        ClipboardManager.Clear();
                        SendResponse(stream, 200, "OK", "application/json", Encoding.UTF8.GetBytes("{\"status\":\"ok\"}"));
                        return;
                    }

                    // 4. Windows Auto-Start Setting
                    if (path == "/api/autostart")
                    {
                        if (method == "GET")
                        {
                            bool isAuto = Program.IsAutoStartEnabled();
                            SendResponse(stream, 200, "OK", "application/json", Encoding.UTF8.GetBytes("{\"enabled\":" + (isAuto ? "true" : "false") + "}"));
                            return;
                        }
                        else if (method == "POST")
                        {
                            bool enable = body.Contains("\"enable\":true") || body.Contains("\"enable\": true");
                            Program.SetAutoStart(enable);
                            SendResponse(stream, 200, "OK", "application/json", Encoding.UTF8.GetBytes("{\"status\":\"ok\",\"enabled\":" + (enable ? "true" : "false") + "}"));
                            return;
                        }
                    }

                    // 5. Input API (Text & Keys)
                    if (path == "/api/input" && method == "POST")
                    {
                        string text = ExtractJsonValue(body, "text");
                        string action = ExtractJsonValue(body, "action");

                        if (!string.IsNullOrEmpty(text))
                        {
                            InputSimulator.SetClipboardAndPasteSta(text);
                        }

                        if (!string.IsNullOrEmpty(action) && action != "none")
                        {
                            InputSimulator.ExecuteKeyAction(action);
                        }

                        SendResponse(stream, 200, "OK", "application/json", Encoding.UTF8.GetBytes("{\"status\":\"ok\"}"));
                        return;
                    }

                    // 6. Direct Keystroke API
                    if (path == "/api/key" && method == "POST")
                    {
                        string key = ExtractJsonValue(body, "key");
                        if (!string.IsNullOrEmpty(key))
                        {
                            InputSimulator.ExecuteKeyAction(key);
                        }
                        SendResponse(stream, 200, "OK", "application/json", Encoding.UTF8.GetBytes("{\"status\":\"ok\"}"));
                        return;
                    }

                    // 7. Image Paste API
                    if (path == "/api/image" && method == "POST")
                    {
                        string b64 = ExtractJsonValue(body, "base64");
                        if (!string.IsNullOrEmpty(b64))
                        {
                            b64 = Regex.Replace(b64, @"^data:image\/\w+;base64,", "");
                            byte[] imgBytes = Convert.FromBase64String(b64);
                            InputSimulator.SetClipboardImageAndPasteSta(imgBytes);
                        }
                        SendResponse(stream, 200, "OK", "application/json", Encoding.UTF8.GetBytes("{\"status\":\"ok\"}"));
                        return;
                    }

                    // 8. Serve Embedded Static Assets (React Web App)
                    string cleanPath = path.TrimStart('/');
                    if (string.IsNullOrEmpty(cleanPath)) cleanPath = "index.html";

                    if (_staticFiles.ContainsKey(cleanPath))
                    {
                        byte[] fileData = _staticFiles[cleanPath];
                        string mime = GetMimeType(cleanPath);
                        SendResponse(stream, 200, "OK", mime, fileData);
                        return;
                    }

                    // Fallback to index.html for Single Page Application client-side routing
                    if (_staticFiles.ContainsKey("index.html"))
                    {
                        byte[] indexData = _staticFiles["index.html"];
                        SendResponse(stream, 200, "OK", "text/html; charset=utf-8", indexData);
                        return;
                    }

                    // Not Found
                    byte[] notFound = Encoding.UTF8.GetBytes("404 Not Found");
                    SendResponse(stream, 404, "Not Found", "text/plain", notFound);
                }
            }
            catch { }
        }

        private static int FindHeaderEnd(byte[] data)
        {
            for (int i = 0; i < data.Length - 3; i++)
            {
                if (data[i] == '\r' && data[i + 1] == '\n' && data[i + 2] == '\r' && data[i + 3] == '\n')
                {
                    return i;
                }
            }
            return -1;
        }

        private static void SendResponse(Stream stream, int statusCode, string statusDesc, string contentType, byte[] body)
        {
            try
            {
                var sb = new StringBuilder();
                sb.AppendFormat("HTTP/1.1 {0} {1}\r\n", statusCode, statusDesc);
                sb.Append("Server: MyPc-Input/1.0.0\r\n");
                sb.AppendFormat("Content-Type: {0}\r\n", contentType);
                sb.AppendFormat("Content-Length: {0}\r\n", body.Length);
                sb.Append("Access-Control-Allow-Origin: *\r\n");
                sb.Append("Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n");
                sb.Append("Access-Control-Allow-Headers: Content-Type\r\n");
                sb.Append("Connection: close\r\n\r\n");

                byte[] header = Encoding.UTF8.GetBytes(sb.ToString());
                stream.Write(header, 0, header.Length);
                if (body.Length > 0)
                {
                    stream.Write(body, 0, body.Length);
                }
                stream.Flush();
            }
            catch { }
        }

        private static string GetMimeType(string path)
        {
            string ext = Path.GetExtension(path).ToLowerInvariant();
            switch (ext)
            {
                case ".html": return "text/html; charset=utf-8";
                case ".js": return "application/javascript; charset=utf-8";
                case ".css": return "text/css; charset=utf-8";
                case ".json": return "application/json";
                case ".png": return "image/png";
                case ".jpg":
                case ".jpeg": return "image/jpeg";
                case ".svg": return "image/svg+xml";
                case ".ico": return "image/x-icon";
                default: return "application/octet-stream";
            }
        }

        private static string ExtractJsonValue(string json, string key)
        {
            var m = Regex.Match(json, "\"" + Regex.Escape(key) + "\"\\s*:\\s*\"((?:\\\\.|[^\"])*)\"");
            if (m.Success)
            {
                return Regex.Unescape(m.Groups[1].Value);
            }
            return "";
        }
    }
}
