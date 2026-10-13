# SPDX-License-Identifier: Apache-2.0
# Include inside the CDN TLS server; the reader/chunk disk owner stays intact.
location = /media/episodes/beerus-01/optimized-720p.mp4 {
    root /srv/shenron-cdn/site-extra;
    limit_except GET HEAD { deny all; }
    add_header Access-Control-Allow-Origin "*" always;
    add_header Cache-Control "public, max-age=86400, no-transform" always;
    add_header X-Content-Type-Options "nosniff" always;
    try_files $uri =404;
}
location = /media/episodes/beerus-01/poster.webp {
    root /srv/shenron-cdn/site-extra;
    limit_except GET HEAD { deny all; }
    add_header Access-Control-Allow-Origin "*" always;
    add_header Cache-Control "public, max-age=86400, no-transform" always;
    add_header X-Content-Type-Options "nosniff" always;
    try_files $uri =404;
}
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
