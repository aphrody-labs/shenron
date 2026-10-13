# SPDX-License-Identifier: Apache-2.0
# Include inside the CDN TLS server; the reader/chunk disk owner stays intact.
location ^~ /media/episodes/ {
    proxy_pass http://127.0.0.1:9077;
    proxy_pass_request_headers off;
    proxy_set_header Host cdn.dragonballfr.com;
    proxy_set_header Range $http_range;
    proxy_set_header If-None-Match $http_if_none_match;
    proxy_set_header If-Modified-Since $http_if_modified_since;
    proxy_connect_timeout 5s;
    proxy_read_timeout 60s;
}
location ^~ /catalog/ {
    proxy_pass http://127.0.0.1:9077;
    proxy_pass_request_headers off;
    proxy_set_header Host cdn.dragonballfr.com;
    proxy_set_header Range $http_range;
    proxy_set_header If-None-Match $http_if_none_match;
    proxy_connect_timeout 5s;
    proxy_read_timeout 60s;
}
location = /.well-known/shenron-cdn-origin.json {
    proxy_pass http://127.0.0.1:9077;
    proxy_pass_request_headers off;
    proxy_set_header Host cdn.dragonballfr.com;
    proxy_connect_timeout 5s;
    proxy_read_timeout 10s;
}
