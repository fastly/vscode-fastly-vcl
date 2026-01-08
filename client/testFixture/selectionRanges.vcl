# Selection Ranges Test Fixture
# Tests smart expanding selection functionality

sub vcl_recv {
  # Simple variable assignment
  set req.http.X-Custom = "value";

  # Nested if blocks for selection expansion
  if (req.url ~ "^/api") {
    set req.http.X-API = "true";
    call validate_api;

    if (req.http.Authorization) {
      set req.http.X-Auth = "present";
    } else {
      set req.http.X-Auth = "missing";
    }
  }

  # Local variable declaration
  declare local var.temp STRING;
  set var.temp = "test";
}

sub validate_api {
  if (req.http.X-API-Key) {
    set req.http.X-Valid = "yes";
  }
}

acl internal {
  "10.0.0.0"/8;
  "192.168.0.0"/16;
}

backend origin {
  .host = "example.com";
  .port = "443";
}

table redirects {
  "/old": "/new",
  "/legacy": "/modern",
}
