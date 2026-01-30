# Semantic tokens test fixture
# Tests various token types and modifiers

acl internal_networks {
  "10.0.0.0"/8;
  "192.168.0.0"/16;
}

table redirects {
  "/old": "/new",
}

backend F_origin_server {
  .host = "example.com";
}

sub custom_handler {
  declare local var.result STRING;
  set var.result = "test";
  log var.result;
}

sub vcl_recv {
  # User variable declaration
  declare local var.count INTEGER;
  set var.count = 0;

  # Built-in variable (read-write)
  set req.url = "/test";

  # Built-in variable (read-only)
  if (client.ip ~ internal_networks) {
    set req.http.X-Internal = "true";
  }

  # Built-in function call
  set req.http.X-Hash = digest.hash_sha256("test");

  # Table lookup (built-in function)
  set req.http.Location = table.lookup(redirects, req.url);

  # Backend assignment
  set req.backend = F_origin_server;

  # Call user subroutine
  call custom_handler;
}

sub vcl_fetch {
  # Built-in variable with different context
  set beresp.ttl = 1h;

  # HTTP header (property)
  set beresp.http.X-Cache = "MISS";

  # Regular expression pattern in ~ operator
  if (beresp.http.Cache-Control ~ "(?:private|no-store)") {
    return(pass);
  }

  # Long string (heredoc-style)
  if (beresp.http.Content-Type ~ {"text/html"}) {
    set beresp.http.X-Content = "html";
  }

  # Regular expression pattern in regsuball function
  set beresp.http.Surrogate-Key = regsuball(beresp.http.Edge-Cache-Tag, ", *", " ");
}
