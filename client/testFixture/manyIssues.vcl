sub vcl_fetch {
  error 999 "/login?s=error";
  error 998 "/login?s=error";
  error 997 "/login?s=error";
  error 996 "/login?s=error";
  error 995 "/login?s=error";
}
