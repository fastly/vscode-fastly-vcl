sub compute_hash(STRING var.input, INTEGER var.rounds) STRING {
  declare local var.result STRING;
  declare local var.counter INTEGER;
  set var.result = var.input;
  set var.counter = 0;
  return var.result;
}

sub validate_request(BOOL var.strict) BOOL {
  declare local var.is_valid BOOL;
  set var.is_valid = true;
  return var.is_valid;
}

sub vcl_recv {
  declare local var.client_ip IP;
  declare local var.start_time TIME;
  declare local var.timeout RTIME;
  declare local var.ratio FLOAT;

  set var.client_ip = client.ip;
  set var.start_time = now;
  set var.timeout = 30s;
  set var.ratio = 0.5;

  # Built-in VCL variable assignments
  set req.backend = F_my_backend;
  set req.hash_always_miss = true;
}

# Subroutine demonstrating built-in backend response variables
sub vcl_fetch {
  set beresp.ttl = 60s;
  set beresp.grace = 10s;
  set beresp.stale_if_error = 3600s;
}

# Subroutine with local variable assignments
sub concat_values STRING {
  declare local var.left STRING;
  declare local var.right STRING;
  declare local var.result STRING;
  set var.left = "hello";
  set var.right = "world";
  set var.result = var.left + var.right;
  return var.result;
}
