sub vcl_recv {
    set req.url = std.replace_prefix(req.url, "/old/", "/new/");
}
