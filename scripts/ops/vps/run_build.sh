#!/bin/bash
set -e
export HOME=/home/ubuntu
cd /home/ubuntu
/bin/bash /home/ubuntu/src/shenron/scripts/ops/vps/shenron-docker-build.sh > /home/ubuntu/shenron-build.log 2>&1
echo "EXIT_CODE=$?" >> /home/ubuntu/shenron-build.log
