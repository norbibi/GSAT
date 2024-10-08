#!/bin/bash

export PYENV_ROOT="/root/.pyenv"
export PATH="$PYENV_ROOT/bin:$PATH"
export XDG_CACHE_HOME=/root/huggingface

eval "$(pyenv init -)"
pyenv activate sst

huggingface-cli login --token $1
if [ $? -eq 0 ]; then
	huggingface-cli download facebook/seamless-expressive pretssel_melhifigan_wm-final.pt  --cache-dir /golem/resources --local-dir /golem/resources
	if [ $? -eq 0 ]; then
		ln -s $(readlink -f /golem/resources/pretssel_melhifigan_wm-final.pt) /root/seamless-streaming/seamless_server/models/Seamless/pretssel_melhifigan_wm.pt
		exit 0
	else
		exit 1
	fi
else
	exit 1
fi
