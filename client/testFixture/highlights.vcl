acl internal { "10.0.0.0"/8; }
table redirects { "/old": "/new" }
backend F_origin { .host = "example.com"; }

sub custom_handler {
  log "custom handler";
}

sub concat_values(STRING var.left, STRING var.right) STRING {
  declare local var.result STRING;
  set var.result = var.left + var.right;
  return var.result;
}

sub vcl_recv {
  # ACL usages
  if (client.ip ~ internal) { }
  if (client.ip !~ internal) { }

  # Table usages
  set req.http.Location = table.lookup(redirects, req.url);
  if (table.contains(redirects, req.url)) { }

  # Backend usages
  set req.backend = F_origin;

  # Subroutine usages
  call custom_handler;

  # Header usages - same header multiple times
  set req.http.X-Custom = "value1";
  set req.http.X-Custom = "value2";
  if (req.http.X-Custom == "value1") { }

  # Different headers should not be highlighted together
  set req.http.X-Other = req.http.X-Custom;

  # Variable usages in function call context
  set req.http.Concat = concat_values("hello", "world");
}

sub vcl_miss {
  # More backend usages
  set req.backend = F_origin;

  # More subroutine usages
  call custom_handler;
}

sub vcl_deliver {
  # Add statement for Set-Cookie header
  add resp.http.Set-Cookie = "myCookie=foo; path=/; SameSite=Strict; Secure; max-age=60";
  add resp.http.Set-Cookie = "otherCookie=bar; path=/";
  if (resp.http.Set-Cookie) { }
}

sub vcl_fetch {
  # Subfield usages - should highlight all occurrences of the same subfield
  unset beresp.http.Cache-Control:private;
  set beresp.http.Cache-Control:private = "";
  if (beresp.http.Cache-Control:private) { }

  # Different subfields should NOT be highlighted together
  set beresp.http.Cache-Control:max-age = "3600";
}
