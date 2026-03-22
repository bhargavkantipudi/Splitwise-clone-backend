FROM node:22-slim as development
ENV NODE_ENV development

WORKDIR /SplitWise-clone-backend

RUN apt-get update -y && apt-get install -y openssl

COPY . .

RUN npm install --save

EXPOSE 3000

CMD [ "npm", "start" ]
