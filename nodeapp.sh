kubectl create -f configFiles/nodeapp.yaml -n hlf
sleep 15
pods=$(kubectl get pods -n hlf |grep nodeapp |awk '{print $1}')
pod=($pods)
kubectl cp $PWD/../artifacts hlf/${pod[0]}:/shared/
