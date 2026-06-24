include "crossfile-included";

sub vcl_recv {
  #FASTLY RECV
  call custom_logic;
}
