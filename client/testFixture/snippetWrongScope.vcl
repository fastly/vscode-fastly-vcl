# @scope: recv
set req.http.X-Foo = "1";
unset resp.http.Server;
