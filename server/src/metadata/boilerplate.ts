export const recv = {
  snippet: `sub vcl_recv {
  #FASTLY recv

  # Normally, you should consider requests other than GET and HEAD to be uncacheable
  # (to this we add the special FASTLYPURGE method)
  if (req.method != "HEAD" && req.method != "GET" && req.method != "FASTLYPURGE") {
    return(pass);
  }

  # If you are using image optimization, insert the code to enable it here
  # See https://developer.fastly.com/reference/io/ for more information.

  return(lookup);
}`,
  desc: `The built-in \`vcl_recv\` subroutine is executed when a client request is received by Fastly or as a result of a \`restart\`.`,
};

export const hash = {
  snippet: `sub vcl_hash {
  set req.hash += req.url;
  set req.hash += req.http.host;
  #FASTLY hash
  return(hash);
}`,
  desc: `The built-in \`vcl_hash\` subroutine is executed when Fastly needs to calculate the address of an object in the cache. `,
};

export const hit = {
  snippet: `sub vcl_hit {
  #FASTLY hit
  return(deliver);
}`,
  desc: `The built-in \`vcl_hit\` subroutine is executed when an object has been found in the cache and is available to be delivered to the client.`,
};

export const miss = {
  snippet: `sub vcl_miss {
  #FASTLY miss
  return(fetch);
}`,
  desc: `The built-in \`vcl_miss\` subroutine is executed when a requested object is not found in the cache by the lookup operation.`,
};

export const pass = {
  snippet: `sub vcl_pass {
  #FASTLY pass
  return(pass);
}`,
  desc: `The built-in \`vcl_pass\` subroutine is executed when pass is returned by the vcl_recv, vcl_miss, or vcl_hit subroutines.`,
};

export const fetch = {
  snippet: `sub vcl_fetch {
  #FASTLY fetch

  # Unset headers that reduce cacheability for images processed using the Fastly image optimizer
  if (req.http.X-Fastly-Imageopto-Api) {
    unset beresp.http.Set-Cookie;
    unset beresp.http.Vary;
  }

  # Log the number of restarts for debugging purposes
  if (req.restarts > 0) {
    set beresp.http.Fastly-Restarts = req.restarts;
  }

  # If the response is setting a cookie, make sure it is not cached
  if (beresp.http.Set-Cookie) {
    return(pass);
  }

  # By default we set a TTL based on the Cache-Control header but we don't parse additional directives
  # like private and no-store.  Private in particular should be respected at the edge:
  if (beresp.http.Cache-Control ~ "(private|no-store)") {
    return(pass);
  }

  # If no TTL has been provided in the response headers, set a default
  if (!beresp.http.Expires && !beresp.http.Surrogate-Control ~ "max-age" && !beresp.http.Cache-Control ~ "(s-maxage|max-age)") {
    set beresp.ttl = 3600s;

    # Apply a longer default TTL for images processed using Image Optimizer
    if (req.http.X-Fastly-Imageopto-Api) {
      set beresp.ttl = 2592000s; # 30 days
      set beresp.http.Cache-Control = "max-age=2592000, public";
    }
  }

  return(deliver);
}`,
  desc: `The built-in \`vcl_fetch\` subroutine is executed just after the headers of a syntactically correct backend response have been received.
  
  If the request arrived in this subroutine from \`vcl_miss\`, the fetched object may be cached. 
  
  If, instead, the \`vcl_fetch\` subroutine is called from \`vcl_pass\`, the fetched object is not cached even if \`beresp.ttl\` is greater than zero.`,
};

export const deliver = {
  snippet: `sub vcl_deliver {
  #FASTLY deliver
  return(deliver);
}`,
  desc: `The built-in \`vcl_deliver\` subroutine is executed before the first byte of the response is emitted to the client. 
  
  Deliver happens on every response individually, including responses delivered from cache and those received from a backend, making it an ideal place to add debugging information or user-specific session data that cannot be shared with other users.`,
};

export const error = {
  snippet: `sub vcl_error {
  #FASTLY error
  return(deliver);
}`,
  desc: `The built-in \`vcl_error\` subroutine is executed when explicitly triggered by an error statement (or \`return(error)\`) in \`vcl_recv\`, \`vcl_hit\`, \`vcl_miss\`, \`vcl_pass\`, or \`vcl_fetch\`, or automatically by Fastly in [certain situations](https://developer.fastly.com/reference/vcl/subroutines/error/).`,
};

export const log = {
  snippet: `sub vcl_log {
  #FASTLY log
}`,
  desc: `The built-in \`vcl_log\` subroutine is executed after the response to the client has finished, and therefore has access to data about the final state of the request, and timing information about the response. `,
};
