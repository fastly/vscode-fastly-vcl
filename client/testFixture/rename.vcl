acl internal { "10.0.0.0"/8; }
table redirects { "/old": "/new" }
backend F_origin { .host = "example.com"; }
sub custom_recv { }

sub vcl_recv {
  if (client.ip ~ internal) { }
  if (client.ip !~ internal) { }
  set req.http.X = table.lookup(redirects, req.url);
  if (table.contains(redirects, req.url)) { }
  set req.backend = F_origin;
  call custom_recv;
}

sub vcl_miss {
  set req.backend = F_origin;
  call custom_recv;
}

sub local_var_example STRING {
  declare local var.result STRING;
  set var.result = "hello";
  set var.result = var.result + " world";
  return var.result;
}

sub param_example(STRING var.input, STRING var.suffix) STRING {
  declare local var.output STRING;
  set var.output = var.input + var.suffix;
  return var.output;
}

sub header_example {
  set req.http.X-Custom-Header = "value1";
  set req.http.X-Custom-Header = "value2";
  if (req.http.X-Custom-Header == "value1") { }
  unset req.http.X-Custom-Header;
}
