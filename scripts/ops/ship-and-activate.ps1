$SHA = "5a3c51658e6185ac1992b11fc3504b9fa0d9d9a3"

Write-Host "Streaming image $SHA from vps to dbfr as user ubuntu..."
$shipCmd = "sudo -u ubuntu bash -c ""docker save localhost/shenron:$SHA | zstd -q -T0 -1 | ssh -o ConnectTimeout=15 -o BatchMode=yes dbfr 'zstd -q -d -o /tmp/shenron-$SHA.tar'"""
aphrody infra ssh exec --host vps -c $shipCmd

Write-Host "Deploying and activating $SHA on dbfr..."
$deployCmd = "sudo -u ubuntu bash /home/ubuntu/deploy-shenron-image.sh $SHA /tmp/shenron-$SHA.tar"
aphrody infra ssh exec --host dbfr -c $deployCmd

Write-Host "Done deploying $SHA."
