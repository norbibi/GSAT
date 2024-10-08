FROM maugnorbert/docker_golem_cuda_12_4_1_nvidia_555_58_ubuntu_20_04:latest

ARG HF_TOKEN

RUN apt-get update && apt-get upgrade -y && apt-get install -y \
	openssh-server \
	nano \
	htop \
	curl \
	ca-certificates \
	gnupg \
	libsndfile1 \
	git \
	ffmpeg \
	libssl-dev \
	zlib1g-dev \
	libbz2-dev \
	libreadline-dev \
	libsqlite3-dev \
	wget \
	libncurses5-dev \
	libncursesw5-dev \
	xz-utils \
	tk-dev \
	liblzma-dev \
	lzma \
	libsox-dev \
	libffi-dev \
	&& rm -rf /var/lib/apt/lists/*

RUN mkdir -p /etc/apt/keyrings
RUN curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
RUN echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_21.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list

RUN apt-get update && apt-get install -y \
	nodejs \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /root

RUN curl https://pyenv.run | bash

ENV PYENV_ROOT="/root/.pyenv"
ENV PATH="$PYENV_ROOT/bin:$PATH"
RUN pyenv install 3.10.12 && pyenv virtualenv 3.10.12 sst

RUN mkdir -p /run/sshd
RUN echo "PermitRootLogin yes" >> /etc/ssh/sshd_config \
    && echo "PasswordAuthentication yes" >> /etc/ssh/sshd_config

RUN git clone https://huggingface.co/spaces/facebook/seamless-streaming /root/seamless-streaming

COPY 0001-gsst.patch /root/

RUN cd /root/seamless-streaming \
	&& git checkout bd3a9cac1dd823259d2f8f54ae1e566e768a5cba \
	&& git apply /root/0001-gsst.patch

RUN cd /root/seamless-streaming/seamless_server \
	&& eval "$(pyenv init -)" && pyenv activate sst \
	&& pip install --no-cache-dir --upgrade pip setuptools wheel py-spy \
	&& pip install --no-cache-dir --upgrade -r requirements.txt \
	&& git clone https://github.com/snakers4/silero-vad /root/huggingface/torch/hub/snakers4_silero-vad_master \
	&& python -m nltk.downloader -d /root/nltk_data all \
	&& huggingface-cli download facebook/seamless-streaming spm_char_lang38_tc.model --local-dir /root/huggingface/fairseq2/assets/23fb34348d2f1029e8e9bb80 \
	&& huggingface-cli download facebook/seamless-streaming seamless_streaming_unity.pt --local-dir /root/huggingface/fairseq2/assets/67ee4586019ee2f8128d8c2c \
	&& huggingface-cli download facebook/seamless-streaming vocoder_v2.pt --local-dir /root/huggingface/fairseq2/assets/72156bff62197705b8e88f19 \
	&& huggingface-cli download facebook/seamless-streaming seamless_streaming_monotonic_decoder.pt --local-dir /root/huggingface/fairseq2/assets/ab809bf1032fc01a6bb9b3e3 \
	&& huggingface-cli download facebook/seamless-streaming tokenizer.model --local-dir /root/huggingface/fairseq2/assets/eedae72756484b914014c3c4

RUN npm install --global yarn

RUN cd /root/seamless-streaming/streaming-react-app \
	&& if [ -f yarn.lock ]; then yarn --frozen-lockfile; \
    elif [ -f package-lock.json ]; then npm ci; \
    elif [ -f pnpm-lock.yaml ]; then yarn global add pnpm && pnpm i --frozen-lockfile; \
    else echo "Lockfile not found." && exit 1; \
    fi \
    && npm run build

COPY *.sh /root/
RUN chmod +x /root/*.sh

VOLUME /golem/resources

WORKDIR /root/seamless-streaming/seamless_server
