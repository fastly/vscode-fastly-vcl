# @scope: deliver
unset resp.http.Server;
set resp.http.X-Width = client.display.width;
