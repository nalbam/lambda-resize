#!/bin/bash

if [ ! -d target ]; then
    mkdir target
fi

pushd src/main/node

zip -q -r ../../../target/lambda *
