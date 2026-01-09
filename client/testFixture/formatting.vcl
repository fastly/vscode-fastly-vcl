// Poorly formatted VCL for testing document formatting
sub vcl_recv{
if(req.url~"^/api"){set req.backend=api_backend;}
    else {
set req.backend= web_backend;}}

acl internal{ "10.0.0.0"/8;"192.168.0.0"/16;}

table redirects{ "/old":"/new",}

backend origin{ .host="example.com";.port="443";}
