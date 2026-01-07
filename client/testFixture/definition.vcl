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

# Subroutine with local variable
sub concat_values STRING {
  declare local var.left STRING;
  declare local var.right STRING;
  declare local var.result STRING;
  set var.left = "hello";
  set var.right = "world";
  set var.result = var.left + var.right;
  return var.result;
}

# Subroutine with parameters
sub concat_params(STRING var.a, STRING var.b) STRING {
  declare local var.result STRING;
  set var.result = var.a + var.b;
  return var.result;
}
