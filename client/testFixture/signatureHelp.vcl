sub vcl_recv {
    set req.url = regsub(req.url, "^/old/", "/new/");
}
