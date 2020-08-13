FROM node:10.15.3

COPY . /app

WORKDIR /app

RUN npm install

RUN apt update

RUN apt install jq -y

COPY . .

EXPOSE 4000

# CMD [ "npm", "start" ]