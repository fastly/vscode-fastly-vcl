sub compression_matches_fetch BOOL {
  if (req.http.Accept-Encoding ~ "gzip|br") {
    return true;
  }
  return false;
}

sub concat_fetch(STRING var.left, STRING var.right) STRING {
  declare local var.both STRING = var.left + var.right;
  return var.both;
}

sub vcl_fetch {
  error 999 "/login?s=error";
  if (std.strcasecmp(req.url, "/error")) {
    set req.http.X-Error-Detected = "true";
  }
  # Deprecated function usage for testing purposes
  if (client.display.width && client.display.height) {
    set req.http.X-Client-Display = client.display.width + "x" + client.display.height;
  }
  set beresp.http.compression-matches = compression_matches_fetch();
  set beresp.http.concat = concat_fetch("Hello, ", "world!");
  header.set(req, "abc", "def");
  return(hit_for_pass);
}

