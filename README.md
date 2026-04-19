# kubestoplight

A simple TUI up/down/hot* for multiple k8s cluster endpoints

## Design Considerations
- Can accept an array of clusters with the method for connecting to them
- Can view pods grouped on the same view cross cluster
- Up and idle pods are green
- Up and changing pods are yellow
- Up and busy pods are orange
- Down and failed pods are red
- Empty pods are gray

## Current Implementation Status
- idea phase

## Testing available
- local RKE2 cluster available
- Can use `sudo -i kubectl` (or provide KUBE_CONFIG) to connect to it
