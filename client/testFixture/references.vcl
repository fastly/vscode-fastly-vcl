acl internal { "10.0.0.0"/8; }
table redirects { "/old": "/new" }
backend origin { .host = "example.com"; }
sub custom_recv { }

sub vcl_recv {
  if (client.ip ~ internal) { }
  if (client.ip !~ internal) { }
  set req.http.X = table.lookup(redirects, req.url);
  if (table.contains(redirects, req.url)) { }
  set req.backend = origin;
  call custom_recv;
}

sub vcl_miss {
  set bereq.backend = origin;
  call custom_recv;
}
