#!/bin/bash

export PYENV_ROOT="/root/.pyenv"
export PATH="$PYENV_ROOT/bin:$PATH"
export XDG_CACHE_HOME=/root/huggingface

eval "$(pyenv init -)"
pyenv activate sst

cd /root/seamless-streaming/seamless_server

if [ -f models/Seamless/pretssel_melhifigan_wm.pt ] ; then
    export USE_EXPRESSIVE_MODEL=1
fi

uvicorn app_pubsub:app --host 0.0.0.0 --port $1
