sub vcl_fetch {
  error 999 "/login?s=error";
}
