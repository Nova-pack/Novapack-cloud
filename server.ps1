Add-Type -AssemblyName System.Net
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:8080/")
$listener.Start()
Write-Host "Server running on http://localhost:8080"
while($true) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $resp = $ctx.Response
    $path = $req.Url.LocalPath
    if($path -eq "/") { $path = "/admin.html" }
    $file = Join-Path "c:\NOVAPACK CLOUD\public" $path.TrimStart("/")
    if(Test-Path $file) {
        $bytes = [IO.File]::ReadAllBytes($file)
        $resp.ContentLength64 = $bytes.Length
        $ext = [IO.Path]::GetExtension($file)
        switch($ext) {
            ".html" { $resp.ContentType = "text/html; charset=utf-8" }
            ".js"   { $resp.ContentType = "application/javascript; charset=utf-8" }
            ".css"  { $resp.ContentType = "text/css" }
            ".json" { $resp.ContentType = "application/json" }
            ".png"  { $resp.ContentType = "image/png" }
            ".ico"  { $resp.ContentType = "image/x-icon" }
        }
        $resp.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
        $resp.StatusCode = 404
    }
    $resp.Close()
}
