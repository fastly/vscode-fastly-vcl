acl internal {
  "10.0.0.0"/8;
  "192.168.0.0"/16;
}

table redirects {
  "/old": "/new",
  "/another": "/path",
}

backend F_origin {
  .host = "example.com";
  .port = "443";
}

sub vcl_recv {
#FASTLY recv

  # ACL usage - click on "internal" to go to definition
  if (client.ip ~ internal) {
    set req.http.X-Internal = "true";
  }

  # Table usage - click on "redirects" to go to definition
  set req.http.Location = table.lookup(redirects, req.url);

  # Backend usage - click on "F_origin" to go to definition
  set req.backend = F_origin;

  return(lookup);
}
