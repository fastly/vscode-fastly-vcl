// Test fixture for lintingEnabled setting test
// This file has linting issues that should be detected when linting is enabled

sub vcl_recv {
    // Error code 601 is reserved
    error 601;
}

sub vcl_fetch {
    // Missing FASTLY FETCH boilerplate
    set beresp.ttl = 3600s;
}
