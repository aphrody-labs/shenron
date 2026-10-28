cd /home/ubuntu/build/transient/shenron-docker
SHA=$(git rev-parse HEAD)
echo "== commit $SHA"
install -D -m 0755 target/release/shenron-mcp dist/mcp/linux-x64/shenron-mcp
install -D -m 0755 target/release/libshenron_ffi.so dist/server/linux-x64/native/libshenron_ffi.so
install -D -m 0755 target/release/koharu-sdk dist/server/linux-x64/native/koharu-sdk
echo "== docker build"
docker build -q -f deploy/docker/Dockerfile --build-arg SHENRON_REVISION="$SHA" -t "localhost/shenron:$SHA" -t localhost/shenron:local .
echo "== smoke tests"
docker run --rm "localhost/shenron:$SHA" version
docker run --rm --entrypoint /usr/local/bin/shenron-bot "localhost/shenron:$SHA" --smoke
docker run --rm --entrypoint /usr/local/bin/koharu-sdk "localhost/shenron:$SHA" --help
echo "BUILD_COMPLETE_OK"