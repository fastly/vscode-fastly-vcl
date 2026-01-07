/*
 * This is a multi-line block comment
 * that should be foldable.
 * It spans multiple lines.
 */

# This is a group of consecutive
# single-line comments that should
# also be foldable as a unit.

acl internal {
  "10.0.0.0"/8;
  "192.168.0.0"/16;
  "127.0.0.1";
}

table redirects {
  "/old": "/new",
  "/legacy": "/modern",
  "/deprecated": "/current",
}

backend F_origin {
  .host = "example.com";
  .port = "443";
  .ssl = true;
}

sub custom_logic {
  if (req.http.X-Custom) {
    set req.http.X-Processed = "true";
  }
}

sub vcl_recv {
  # Check for internal networks
  if (client.ip ~ internal) {
    set req.http.X-Internal = "true";

    if (req.http.X-Debug) {
      set req.http.X-Debug-Internal = "true";
    } else {
      set req.http.X-Debug-Internal = "false";
    }
  }

  # Handle redirects
  if (table.lookup(redirects, req.url)) {
    error 301;
  }

  set req.backend = F_origin;
  call custom_logic;
}

sub vcl_error {
  if (obj.status == 301) {
    set obj.http.Location = table.lookup(redirects, req.url);
    return(deliver);
  }
}
