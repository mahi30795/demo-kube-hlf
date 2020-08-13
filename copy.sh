cas=$(kubectl get pods -n hlf | grep ca | awk '{print $1}')

for i in $cas
do 
    echo "copying contents to $i"
    kubectl cp $PWD/../artifacts/ hlf/$i:/shared/
done

orderers=$(kubectl get pods -n hlf | grep orderer | awk '{print $1}')

for i in $orderers
do 
    echo "copying contents to $i"
    kubectl cp $PWD/../artifacts/ hlf/$i:/shared/
done


orgs=$(kubectl get pods -n hlf | grep peer | awk '{print $1}')

for i in $orgs
do 
    echo "copying contents to $i"
    kubectl cp $PWD/../artifacts/ hlf/$i:/shared/
done