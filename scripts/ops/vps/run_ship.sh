#!/bin/bash
set -e
export HOME=/home/ubuntu
cd /home/ubuntu
/bin/bash /home/ubuntu/src/shenron/scripts/ops/vps/ship-shenron.sh > /home/ubuntu/shenron-ship.log 2>&1
echo "EXIT_CODE=$?" >> /home/ubuntu/shenron-ship.log
