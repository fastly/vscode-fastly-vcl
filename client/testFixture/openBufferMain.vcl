# The diagnostics test removes buffer_helper from the included module in an
# unsaved edit; the "+" in its file name is percent-encoded in VS Code URIs.
include "openBuffer+module";

sub vcl_recv {
#FASTLY RECV
  call buffer_helper;
}
