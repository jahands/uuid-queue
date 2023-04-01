#!/bin/bash

echo $(cat package.json|jq -r '.version')-$(git log -1 --pretty=format:%h)
