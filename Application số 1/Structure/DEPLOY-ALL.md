# DEPLOY-ALL — tổng hợp file deploy của các game

Tạo tự động ngày 2026-10-02 từ `game-template-repo/*` (bỏ qua `home-page-clone`).
Mục lục:
- dau-than-tuyet-the: 9 file
- giang-ho-ky-ngo: 5 file
- huyen-anh-volam: 5 file
- luctung-tamquoc: 6 file
- phong-ma-daosi: 8 file
- phuong-hoang-tru-tien: 6 file
- quy-mon-quan: 5 file
- samkok-tamquoc: 5 file
- ta-la-hac-ngokhong: 5 file
- tamquoc-daiminhtinh: 6 file
- tamquoc-quan-anh: 10 file
- than-ma-ao-hoa: 6 file
- thao-tung-tamquoc: 5 file
- thoi-khong-chi-mong: 5 file
- tuyetdinh-chiengioi: 6 file

Giá trị trông như bí mật (SECRET/TOKEN/PASSWORD/KEY) đã thay bằng `***`. File giống hệt file đã in trước đó được ghi là "giống ...".


---

## dau-than-tuyet-the

### t010-website-homepage/Dockerfile

```dockerfile
FROM node:20.2-alpine3.16 as build
WORKDIR /usr/src/app
ARG DEPLOY
COPY package*.json ./


# RUN npm cache clean --force
# RUN npm cache verify
RUN apk add git tzdata
RUN apk add gettext libintl
ENV TZ="Asia/Ho_Chi_Minh"
RUN yarn install

COPY . .
COPY deploy/${DEPLOY}/env.example ./.env

RUN yarn build

EXPOSE 3000
CMD ["yarn", "start"]

# FROM nginx:1.19.0
# COPY --from=build /usr/src/app/.next/ /usr/share/nginx/html
# COPY nginx.conf /etc/nginx/conf.d/default.conf
# EXPOSE 80
# CMD ["nginx", "-g", "daemon off;"]
```

### t010-website-homepage/Jenkinsfile

```groovy
@Library('jenkins-libs') _
VTVliveVplayNodeJS(domain:"dauthan.vplay.vn",container_port:"3000",service_path:"/",service_name:"dauthan-homepage",namespace:"vplay")
```

### t010-website-homepage/deploy/develop/deploy.yaml

```yaml
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
data:
  .env: |-
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  selector:
    matchLabels:
      service: ${SERVICE_NAME}
  replicas: 1
  template:
    metadata:
      labels:
        service: ${SERVICE_NAME}
        logger: nlog
      annotations:
    spec:
      terminationGracePeriodSeconds: 60
      containers:
        - name: ${SERVICE_NAME}
          image: ${IMAGE}
          env:
            - name: TZ
              value: Etc/GMT-7
            - name: NEXT_PUBLIC_API_URL
              value: https://dev.vplay.vn/website-api/api/frontend
            - name: NEXT_PUBLIC_SUBSCRIBE_API_URL
              value: https://dev-dauthan-api.vplay.vn/Game
            - name: NEXT_PUBLIC_GAME_ID
              value: "1014"
            - name: NEXT_PUBLIC_NODE_ENV
              value: development
          ports:
            - containerPort: ${CONTAINER_PORT}
          volumeMounts:
            - name: ${SERVICE_NAME}
              mountPath: /usr/src/app/.env
              subPath: .env
      nodeSelector:
      imagePullSecrets:
        - name: registry
      restartPolicy: Always
      volumes:
        - name: ${SERVICE_NAME}
          configMap:
            name: ${SERVICE_NAME}
---
apiVersion: v1
kind: Service
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  ports:
    - port: ${CONTAINER_PORT}
      protocol: TCP
  selector:
    service: ${SERVICE_NAME}
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
  annotations:
    kubernetes.io/ingress.class: nginx
spec:
  rules:
    - host: ${DOMAIN}
      http:
        paths:
          - path: ${SERVICE_PATH}
            pathType: Prefix
            backend:
              service:
                name: ${SERVICE_NAME}
                port:
                  number: ${CONTAINER_PORT}
```

### t010-website-homepage/deploy/develop/env.example

```
NEXT_PUBLIC_API_URL=https://dev.vplay.vn/website-api/api/frontend
NEXT_PUBLIC_GAME_ID=1014
NEXT_PUBLIC_NODE_ENV=development
NEXT_PUBLIC_GOOGLE_ANALYTICS=G-60CEWVW0H3
NEXT_PUBLIC_SUBSCRIBE_API_URL=https://dev-dauthan-api.vplay.vn/Game
NEXT_PUBLIC_METADATA_BASE=https://dev-dauthan.vplay.vn
```

### t010-website-homepage/deploy/production/deploy.yaml

```yaml
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
data:
  .env: |-
   
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  selector:
    matchLabels:
      service: ${SERVICE_NAME}
  replicas: 2
  template:
    metadata:
      labels:
        service: ${SERVICE_NAME}
        logger: nlog
      annotations:
    spec:
      terminationGracePeriodSeconds: 60
      containers:
        - name: ${SERVICE_NAME}
          image: ${IMAGE}
          env:
            - name: TZ
              value: Etc/GMT-7
            - name: NEXT_PUBLIC_SUBSCRIBE_API_URL
              value: https://dauthan-api.vplay.vn/Game
            - name: NEXT_PUBLIC_API_URL
              value: https://vplay.vn/website-api/api/frontend
            - name: NEXT_PUBLIC_GAME_ID
              value: "10"
            - name: NEXT_PUBLIC_NODE_ENV
              value: production
          ports:
            - containerPort: ${CONTAINER_PORT}
          volumeMounts:
            - name: ${SERVICE_NAME}
              mountPath: /usr/src/app/.env
              subPath: .env
      nodeSelector:
      imagePullSecrets:
        - name: registry
      restartPolicy: Always
      volumes:
        - name: ${SERVICE_NAME}
          configMap:
            name: ${SERVICE_NAME}
---
apiVersion: v1
kind: Service
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  ports:
    - port: ${CONTAINER_PORT}
      protocol: TCP
  selector:
    service: ${SERVICE_NAME}
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name:  ${SERVICE_NAME}
  namespace: ${NAMESPACE}
  annotations:
    kubernetes.io/ingress.class: nginx
spec:
  rules:
  - host: ${DOMAIN}
    http:
      paths:
      - path: ${SERVICE_PATH}
        pathType: Prefix
        backend:
          service:
            name: ${SERVICE_NAME}
            port:
              number: ${CONTAINER_PORT}
```

### t010-website-homepage/deploy/production/env.example

```
NEXT_PUBLIC_API_URL=https://vplay.vn/website-api/api/frontend
NEXT_PUBLIC_GAME_ID=10
NEXT_PUBLIC_NODE_ENV=production
NEXT_PUBLIC_GOOGLE_ANALYTICS=G-60CEWVW0H3
NEXT_PUBLIC_SUBSCRIBE_API_URL=https://dauthan-api.vplay.vn/Game
NEXT_PUBLIC_METADATA_BASE=https://dauthan.vplay.vn
```

### t010-website-homepage/deploy/staging/deploy.yaml

```yaml
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
data:
  .env: |-

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  selector:
    matchLabels:
      service: ${SERVICE_NAME}
  replicas: 1
  template:
    metadata:
      labels:
        service: ${SERVICE_NAME}
        logger: nlog
      annotations:
    spec:
      terminationGracePeriodSeconds: 60
      containers:
        - name: ${SERVICE_NAME}
          image: ${IMAGE}
          env:
            - name: TZ
              value: Etc/GMT-7
          ports:
            - containerPort: ${CONTAINER_PORT}
          volumeMounts:
            - name: ${SERVICE_NAME}
              mountPath: /usr/src/app/.env
              subPath: .env
      nodeSelector:
      imagePullSecrets:
        - name: registry
      restartPolicy: Always
      volumes:
        - name: ${SERVICE_NAME}
          configMap:
            name: ${SERVICE_NAME}
---
apiVersion: v1
kind: Service
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  ports:
    - port: ${CONTAINER_PORT}
      protocol: TCP
  selector:
    service: ${SERVICE_NAME}
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
  annotations:
    kubernetes.io/ingress.class: nginx
spec:
  rules:
    - host: ${DOMAIN}
      http:
        paths:
          - path: ${SERVICE_PATH}
            pathType: Prefix
            backend:
              service:
                name: ${SERVICE_NAME}
                port:
                  number: ${CONTAINER_PORT}
```

### t010-website-homepage/deploy/staging/env.example

```
NEXT_PUBLIC_API_URL=https://vplay.vn/website-api/api/frontend
NEXT_PUBLIC_GAME_ID=10
NEXT_PUBLIC_NODE_ENV=staging
NEXT_PUBLIC_GOOGLE_ANALYTICS=G-60CEWVW0H3
NEXT_PUBLIC_SUBSCRIBE_API_URL=https://dauthan-api.vplay.vn/Game
NEXT_PUBLIC_METADATA_BASE=https://dauthan.vplay.vn
```

### t010-website-homepage/deploy/testing/deploy.yaml

```yaml
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
data:
  .env: |-

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  selector:
    matchLabels:
      service: ${SERVICE_NAME}
  replicas: 1
  template:
    metadata:
      labels:
        service: ${SERVICE_NAME}
        logger: nlog
      annotations:
    spec:
      terminationGracePeriodSeconds: 60
      containers:
        - name: ${SERVICE_NAME}
          image: ${IMAGE}
          env:
            - name: TZ
              value: Etc/GMT-7
          ports:
            - containerPort: ${CONTAINER_PORT}
          volumeMounts:
            - name: ${SERVICE_NAME}
              mountPath: /usr/src/app/.env
              subPath: .env
      nodeSelector:
      imagePullSecrets:
        - name: registry
      restartPolicy: Always
      volumes:
        - name: ${SERVICE_NAME}
          configMap:
            name: ${SERVICE_NAME}
---
apiVersion: v1
kind: Service
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  ports:
    - port: ${CONTAINER_PORT}
      protocol: TCP
  selector:
    service: ${SERVICE_NAME}
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name:  ${SERVICE_NAME}
  namespace: ${NAMESPACE}
  annotations:
    kubernetes.io/ingress.class: nginx
spec:
  rules:
  - host: ${DOMAIN}
    http:
      paths:
      - path: ${SERVICE_PATH}
        pathType: Prefix
        backend:
          service:
            name: ${SERVICE_NAME}
            port:
              number: ${CONTAINER_PORT}
```

---

## giang-ho-ky-ngo

### t030-giang-ho-ky-ngo-website-web/deploy/develop/.env.example

```
NEXT_PUBLIC_HUB=https://dev.vplay.vn/website-api
NEXT_PUBLIC_HUB_GAME_ID=36
NEXT_PUBLIC_RANKING_API=https://dev-game-services-api.vplay.vn/api
NEXT_PUBLIC_RANKING_GAME_ID=36
```

### t030-giang-ho-ky-ngo-website/Dockerfile

```dockerfile

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
ARG BUILD_MODE
WORKDIR /vtvlive/src/app
COPY . .

#RUN dotnet restore "Affiliate API.csproj"
RUN dotnet restore "T030-GiangHoKyNgo.csproj"
RUN dotnet build "T030-GiangHoKyNgo.csproj" -c $BUILD_MODE -o /app/build

FROM build AS publish
ARG BUILD_MODE
RUN dotnet publish "T030-GiangHoKyNgo.csproj" -c $BUILD_MODE -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
EXPOSE 8080
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "T030-GiangHoKyNgo.dll"]
```

### t030-giang-ho-ky-ngo-website/Jenkinsfile

```groovy
@Library('jenkins-libs') _
VTVLiveVplayNetcoreautodev(domain:"gianghokyngo.vplay.vn",container_port:"8080",service_path:"/",namespace:"vplay",service_name:"t030-giang-ho-ky-ngo-web")
```

### t030-giang-ho-ky-ngo-website/deploy/develop/deploy.yaml

```yaml
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
data:
 appsettings.json: |-
  {
   "SiteSettings": {
      "AppHubId": 36
    },
    "Logging": {
      "LogLevel": {
        "Default": "Information",
        "Microsoft.AspNetCore": "Warning"
      }
    },
    "AllowedHosts": "*",
    "ConnectionStrings": {}
  }

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  selector:
    matchLabels:
      service: ${SERVICE_NAME}
  replicas: 1
  template:
    metadata:
      labels:
        service: ${SERVICE_NAME}
        logger: nlog
      annotations:
    spec:
      terminationGracePeriodSeconds: 60
      containers:
      - name: ${SERVICE_NAME}
        image: ${IMAGE}
        env:
        - name: TZ
          value: Etc/GMT-7
        - name: ASPNETCORE_ENVIRONMENT
          value: Development
        ports:
        - containerPort: ${CONTAINER_PORT}
          protocol: TCP
        volumeMounts:
          - name: ${SERVICE_NAME}
            mountPath: /app/appsettings.json
            subPath: appsettings.json
      nodeSelector:
      imagePullSecrets:
      - name: registry
      restartPolicy: Always
      volumes:
      - name: ${SERVICE_NAME}
        configMap:
          name: ${SERVICE_NAME}
---
apiVersion: v1
kind: Service
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  ports:
  - port: ${CONTAINER_PORT}
    protocol: TCP
  selector:
    service: ${SERVICE_NAME}
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name:  ${SERVICE_NAME}
  namespace: ${NAMESPACE}
  annotations:
    kubernetes.io/ingress.class: nginx
    # nginx.ingress.kubernetes.io/rewrite-target: /$2
spec:
  rules:
  - host: ${DOMAIN}
    http:
      paths:
      - path: ${SERVICE_PATH}
        pathType: Prefix
        backend:
          service:
            name: ${SERVICE_NAME}
            port:
              number: ${CONTAINER_PORT}
```

### t030-giang-ho-ky-ngo-website/deploy/production/deploy.yaml

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  selector:
    matchLabels:
      service: ${SERVICE_NAME}
  replicas: 2
  template:
    metadata:
      labels:
        service: ${SERVICE_NAME}
        logger: nlog
    spec:
      terminationGracePeriodSeconds: 60
      containers:
      - name: ${SERVICE_NAME}
        image: ${IMAGE}
        env:
        - name: TZ
          value: Etc/GMT-7
        ports:
        - containerPort: ${CONTAINER_PORT}
      nodeSelector:
      imagePullSecrets:
      - name: registry
      restartPolicy: Always
      volumes:
      - name: ${SERVICE_NAME}
        secret:
          secretName: ${SERVICE_NAME}

---
apiVersion: v1
kind: Service
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  ports:
  - port: ${CONTAINER_PORT}
    protocol: TCP
  selector:
    service: ${SERVICE_NAME}

---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
  annotations:
    kubernetes.io/ingress.class: nginx
spec:
  rules:
  - host: ${DOMAIN}
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: ${SERVICE_NAME}
            port:
              number: ${CONTAINER_PORT}
```

---

## huyen-anh-volam

### t027-huyen-anh-vo-lam-homepage-web/deploy/develop/.env.example

```
NEXT_PUBLIC_HUB=https://dev.vplay.vn/website-api
NEXT_PUBLIC_HUB_GAME_ID=1039
NEXT_PUBLIC_RANKING_API=https://dev-game-services-api.vplay.vn/api
NEXT_PUBLIC_RANKING_GAME_ID=1039
```

### t027-huyen-anh-vo-lam-homepage/Dockerfile

```dockerfile

FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
ARG BUILD_MODE
WORKDIR /vtvlive/src/app
COPY . .

#RUN dotnet restore "Affiliate API.csproj"

RUN dotnet build "T027-Homepage.csproj" -c $BUILD_MODE -o /app/build

FROM build AS publish
ARG BUILD_MODE
RUN dotnet publish "T027-Homepage.csproj" -c $BUILD_MODE -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS final
WORKDIR /app
EXPOSE 8080
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "T027-Homepage.dll"]
```

### t027-huyen-anh-vo-lam-homepage/Jenkinsfile

```groovy
@Library('jenkins-libs') _
VTVLiveVplayNetcoreautodev(domain:"huyenanhvolam.vplay.vn",container_port:"8080",service_path:"/",namespace:"vplay",service_name:"t027-huyen-anh-vo-lam-homepage")
```

### t027-huyen-anh-vo-lam-homepage/deploy/develop/deploy.yaml

```yaml
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
data:
  appsettings.json: |-
    {
        "SiteConfigs": {
          "HubGameId": 1039,
          "HubApiRoot": "https://dev.vplay.vn/website-api",
          "RootPath": "/",
          "SiteUrl": "https://localhost:7071/",
          "SiteName": "dev-huyenanhvolam.vplay.vn",
          "RedisServer": "10.54.10.64:6379",
          "CacheInstance": "T027_dev:"
        },
        "Logging": {
          "LogLevel": {
            "Default": "Information",
            "Microsoft.AspNetCore": "Warning"
          }
        },
        "AllowedHosts": "*"
    }


---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  selector:
    matchLabels:
      service: ${SERVICE_NAME}
  replicas: 1
  template:
    metadata:
      labels:
        service: ${SERVICE_NAME}
        logger: nlog
      annotations:
    spec:
      terminationGracePeriodSeconds: 60
      containers:
      - name: ${SERVICE_NAME}
        image: ${IMAGE}
        env:
        - name: TZ
          value: Etc/GMT-7
        - name: ASPNETCORE_ENVIRONMENT
          value: Development
        ports:
        - containerPort: ${CONTAINER_PORT}
        volumeMounts:
          - name: ${SERVICE_NAME}
            mountPath: /app/appsettings.json
            subPath: appsettings.json
      nodeSelector:
      imagePullSecrets:
      - name: registry
      restartPolicy: Always
      volumes:
      - name: ${SERVICE_NAME}
        configMap:
          name: ${SERVICE_NAME}
---
apiVersion: v1
kind: Service
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  ports:
  - port: ${CONTAINER_PORT}
    protocol: TCP
  selector:
    service: ${SERVICE_NAME}
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name:  ${SERVICE_NAME}
  namespace: ${NAMESPACE}
  annotations:
    kubernetes.io/ingress.class: nginx
    # nginx.ingress.kubernetes.io/rewrite-target: /$2
spec:
  rules:
  - host: ${DOMAIN}
    http:
      paths:
      - path: ${SERVICE_PATH}
        pathType: Prefix
        backend:
          service:
            name: ${SERVICE_NAME}
            port:
              number: ${CONTAINER_PORT}
```

### t027-huyen-anh-vo-lam-homepage/deploy/production/deploy.yaml

```yaml
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
data:
  appsettings.json: |-
    {
        "SiteConfigs": {
          "HubGameId": 30,
          "HubApiRoot": "https://vplay.vn/website-api",
          "RootPath": "/",
          "SiteUrl": "https://huyenanhvolam.vplay.vn/",
          "SiteName": "huyenanhvolam.vplay.vn",
          "RedisServer": "10.54.10.64:6379",
          "CacheInstance": "T027_prod:"
        },
        "Logging": {
          "LogLevel": {
            "Default": "Information",
            "Microsoft.AspNetCore": "Warning"
          }
        },
        "AllowedHosts": "*"
    }


---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  selector:
    matchLabels:
      service: ${SERVICE_NAME}
  replicas: 3
  template:
    metadata:
      labels:
        service: ${SERVICE_NAME}
        logger: nlog
      annotations:
    spec:
      terminationGracePeriodSeconds: 60
      containers:
      - name: ${SERVICE_NAME}
        image: ${IMAGE}
        env:
        - name: TZ
          value: Etc/GMT-7
        - name: ASPNETCORE_ENVIRONMENT
          value: Development
        ports:
        - containerPort: ${CONTAINER_PORT}
        volumeMounts:
          - name: ${SERVICE_NAME}
            mountPath: /app/appsettings.json
            subPath: appsettings.json
      nodeSelector:
      imagePullSecrets:
      - name: registry
      restartPolicy: Always
      volumes:
      - name: ${SERVICE_NAME}
        configMap:
          name: ${SERVICE_NAME}
---
apiVersion: v1
kind: Service
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  ports:
  - port: ${CONTAINER_PORT}
    protocol: TCP
  selector:
    service: ${SERVICE_NAME}
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name:  ${SERVICE_NAME}
  namespace: ${NAMESPACE}
  annotations:
    kubernetes.io/ingress.class: nginx
    # nginx.ingress.kubernetes.io/rewrite-target: /$2
spec:
  rules:
  - host: ${DOMAIN}
    http:
      paths:
      - path: ${SERVICE_PATH}
        pathType: Prefix
        backend:
          service:
            name: ${SERVICE_NAME}
            port:
              number: ${CONTAINER_PORT}
```

---

## luctung-tamquoc

### home/Dockerfile

```dockerfile
FROM node:18-alpine3.18
WORKDIR /usr/src/app
ARG DEPLOY
COPY package*.json ./


# RUN npm cache clean --force
# RUN npm cache verify
RUN apk add git tzdata
RUN apk add gettext libintl
ENV TZ="Asia/Ho_Chi_Minh"
RUN npm install

COPY . .
COPY deploy/${DEPLOY}/.env.example ./.env

RUN npm run build


EXPOSE 3000
CMD ["npm","run","start"]
```

### home/Jenkinsfile

```groovy
@Library('jenkins-libs') _
VTVliveVplayNodeJS(domain:"luctung.vplay.vn",container_port:"3000",service_path:"/",namespace:"vplay",service_name:"t019-home")
```

### home/deploy/develop/.env.example

```
NEXT_PUBLIC_GAME_ID=1026
NEXT_PUBLIC_BASE_API=https://dev.vplay.vn/website-api/api/frontend
NEXT_PUBLIC_APP_SERVICE_PATH=https://website-assets-cdn.vtvlive.vn/web-game/t019/hompage
NEXT_PUBLIC_CONFIG_GTM=GTM-M27HZXNZ
NEXT_PUBLIC_DOMAIN=https://dev-luctung.vplay.vn
NEXT_PUBLIC_API_RANK=https://game-services-api.vplay.vn
NEXT_PUBLIC_GAME=/T019
NEXT_PUBLIC_SERVICES_API=https://dev-game-services-api.vplay.vn/api
NEXT_PUBLIC_PASS_EVENT=Txyz019@
```

### home/deploy/develop/deploy.yaml

```yaml
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
data:
  .env: |-
    NEXT_PUBLIC_GAME_ID=1026
    NEXT_PUBLIC_BASE_API=https://dev.vplay.vn/website-api/api/frontend
    NEXT_PUBLIC_APP_SERVICE_PATH=https://website-assets-cdn.vtvlive.vn/web-game/t019/hompage
    NEXT_PUBLIC_CONFIG_GTM=GTM-M27HZXNZ
    NEXT_PUBLIC_DOMAIN=https://dev-luctung.vplay.vn
    NEXT_PUBLIC_API_RANK=https://game-services-api.vplay.vn
    NEXT_PUBLIC_GAME=/T019
    NEXT_PUBLIC_SERVICES_API=https://dev-game-services-api.vplay.vn/api
    NEXT_PUBLIC_PASS_EVENT=Txyz019@
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  selector:
    matchLabels:
      service: ${SERVICE_NAME}
  replicas: 1
  template:
    metadata:
      labels:
        service: ${SERVICE_NAME}
        logger: nlog
      annotations:
    spec:
      terminationGracePeriodSeconds: 60
      containers:
        - name: ${SERVICE_NAME}
          image: ${IMAGE}
          ports:
            - containerPort: ${CONTAINER_PORT}
      nodeSelector:
      imagePullSecrets:
        - name: registry
      restartPolicy: Always
---
apiVersion: v1
kind: Service
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  ports:
    - port: ${CONTAINER_PORT}
      protocol: TCP
  selector:
    service: ${SERVICE_NAME}
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
  annotations:
    kubernetes.io/ingress.class: nginx
    #nginx.ingress.kubernetes.io/rewrite-target: /$2
spec:
  rules:
    - host: ${DOMAIN}
      http:
        paths:
          - path: ${SERVICE_PATH}
            pathType: Prefix
            backend:
              service:
                name: ${SERVICE_NAME}
                port:
                  number: ${CONTAINER_PORT}
```

### home/deploy/production/.env.example

```
NEXT_PUBLIC_GAME_ID=22
NEXT_PUBLIC_BASE_API=https://vplay.vn/website-api/api/frontend
NEXT_PUBLIC_APP_SERVICE_PATH=https://website-assets-cdn.vtvlive.vn/web-game/t019/hompage
NEXT_PUBLIC_CONFIG_GTM=GTM-K2HQN8Z9
NEXT_PUBLIC_DOMAIN=https://luctung.vplay.vn
NEXT_PUBLIC_API_RANK=https://game-services-api.vplay.vn
NEXT_PUBLIC_GAME=/T019
NEXT_PUBLIC_SERVICES_API=https://game-services-api.vplay.vn/api
NEXT_PUBLIC_PASS_EVENT=Txyz019@
```

### home/deploy/production/deploy.yaml

```yaml
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
data:
  .env: |-
    NEXT_PUBLIC_GAME_ID=22
    NEXT_PUBLIC_BASE_API=https://vplay.vn/website-api/api/frontend
    NEXT_PUBLIC_APP_SERVICE_PATH=https://website-assets-cdn.vtvlive.vn/web-game/t019/hompage
    NEXT_PUBLIC_CONFIG_GTM=GTM-K2HQN8Z9
    NEXT_PUBLIC_DOMAIN=https://luctung.vplay.vn
    NEXT_PUBLIC_API_RANK=https://game-services-api.vplay.vn
    NEXT_PUBLIC_GAME=/T019
    NEXT_PUBLIC_SERVICES_API=https://game-services-api.vplay.vn/api
    NEXT_PUBLIC_PASS_EVENT=Txyz019@
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  selector:
    matchLabels:
      service: ${SERVICE_NAME}
  replicas: 1
  template:
    metadata:
      labels:
        service: ${SERVICE_NAME}
        logger: nlog
      annotations:
    spec:
      terminationGracePeriodSeconds: 60
      containers:
        - name: ${SERVICE_NAME}
          image: ${IMAGE}
          ports:
            - containerPort: ${CONTAINER_PORT}
      nodeSelector:
      imagePullSecrets:
        - name: registry
      restartPolicy: Always
---
apiVersion: v1
kind: Service
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  ports:
    - port: ${CONTAINER_PORT}
      protocol: TCP
  selector:
    service: ${SERVICE_NAME}
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
  annotations:
    kubernetes.io/ingress.class: nginx
    #nginx.ingress.kubernetes.io/rewrite-target: /$2
spec:
  rules:
    - host: ${DOMAIN}
      http:
        paths:
          - path: ${SERVICE_PATH}
            pathType: Prefix
            backend:
              service:
                name: ${SERVICE_NAME}
                port:
                  number: ${CONTAINER_PORT}
```

---

## phong-ma-daosi

### t015-pmds-landing01-fe/Dockerfile

```dockerfile
FROM node:20.2-alpine3.16 as build
WORKDIR /usr/src/app
ARG DEPLOY
COPY package*.json ./


# RUN npm cache clean --force
# RUN npm cache verify
RUN apk add git tzdata
RUN apk add gettext libintl
ENV TZ="Asia/Ho_Chi_Minh"
RUN yarn install

COPY . .
COPY deploy/${DEPLOY}/.env.example ./.env

RUN yarn build

EXPOSE 3000
CMD ["yarn", "start"]

# FROM nginx:1.19.0
# COPY --from=build /usr/src/app/.next/ /usr/share/nginx/html
# COPY nginx.conf /etc/nginx/conf.d/default.conf
# EXPOSE 80
# CMD ["nginx", "-g", "daemon off;"]
```

### t015-pmds-landing01-fe/Jenkinsfile

```groovy
@Library('jenkins-libs') _
VTVliveVplayNodeJS(domain:"phongmadaosi.vplay.vn",container_port:"3000",service_path:"/",service_name:"phongmadaosi-landing",namespace:"vplay")
```

### t015-pmds-landing01-fe/deploy/develop/.env.example

```
NEXT_PUBLIC_API_BASE_URL=https://dev-pmds-cms-api.vplay.vn/api/Web/
NEXT_PUBLIC_APP_CLIENT_ID=09b82f7626684ed5
NEXT_PUBLIC_APP_CLIENT_SECRET=***
NEXT_PUBLIC_LOGIN_DOMAIN=https://dev-id.onlive.vn
NEXT_PUBLIC_DOMAIN=https://dev-phongmadaosi.vplay.vn
NEXT_PUBLIC_SECRET_KEY=***
NEXT_PUBLIC_FACEBOOK=https://facebook.com
NEXT_PUBLIC_GROUP=https://facebook.com/groups/bag
NEXT_PUBLIC_TIKTOK=https://tiktok.com
NEXT_PUBLIC_HUB=https://dev.vplay.vn/website-api
NEXT_PUBLIC_GAME_ID=1022
NEXT_PUBLIC_WEBSHOP=https://dev.vplay.vn/webshop-api
NEXT_PUBLIC_OIDC=https://dev-id.onlive.vn/api-core/v2/oidc-service
NEXT_PUBLIC_ENV=_SAID
NEXT_PUBLIC_API_SNAKE=https://dev-pmds-cms-api.vplay.vn/api
NEXT_PUBLIC_BASE_IMG=https://website-assets-cdn.vtvlive.vn/web-game/t015
```

### t015-pmds-landing01-fe/deploy/develop/deploy.yaml

```yaml
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
data:
  .env: |-
    NEXT_PUBLIC_API_BASE_URL=https://dev-pmds-cms-api.vplay.vn/api/Web/
    NEXT_PUBLIC_APP_CLIENT_ID=09b82f7626684ed5
    NEXT_PUBLIC_APP_CLIENT_SECRET=***
    NEXT_PUBLIC_LOGIN_DOMAIN=https://dev-id.onlive.vn
    NEXT_PUBLIC_DOMAIN=https://dev-phongmadaosi.vplay.vn
    NEXT_PUBLIC_SECRET_KEY=***
    NEXT_PUBLIC_FACEBOOK=https://facebook.com
    NEXT_PUBLIC_GROUP=https://facebook.com/groups/bag
    NEXT_PUBLIC_TIKTOK=https://tiktok.com
    NEXT_PUBLIC_HUB=https://dev.vplay.vn/website-api
    NEXT_PUBLIC_GAME_ID=1022
    NEXT_PUBLIC_WEBSHOP=https://dev.vplay.vn/webshop-api
    NEXT_PUBLIC_OIDC=https://dev-id.onlive.vn/api-core/v2/oidc-service
    NEXT_PUBLIC_ENV=_SAID
    NEXT_PUBLIC_API_SNAKE=https://dev-pmds-cms-api.vplay.vn/api
    NEXT_PUBLIC_BASE_IMG=https://website-assets-cdn.vtvlive.vn/web-game/t015

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  selector:
    matchLabels:
      service: ${SERVICE_NAME}
  replicas: 1
  template:
    metadata:
      labels:
        service: ${SERVICE_NAME}
        logger: nlog
      annotations:
    spec:
      terminationGracePeriodSeconds: 60
      containers:
        - name: ${SERVICE_NAME}
          image: ${IMAGE}
          ports:
            - containerPort: ${CONTAINER_PORT}
          volumeMounts:
            - name: ${SERVICE_NAME}
              mountPath: /usr/src/app/.env
              subPath: .env
      nodeSelector:
      imagePullSecrets:
        - name: registry
      restartPolicy: Always
      volumes:
        - name: ${SERVICE_NAME}
          configMap:
            name: ${SERVICE_NAME}
---
apiVersion: v1
kind: Service
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  ports:
    - port: ${CONTAINER_PORT}
      protocol: TCP
  selector:
    service: ${SERVICE_NAME}
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
  annotations:
    kubernetes.io/ingress.class: nginx
    # nginx.ingress.kubernetes.io/rewrite-target: /$2
spec:
  rules:
    - host: ${DOMAIN}
      http:
        paths:
          - path: ${SERVICE_PATH}
            pathType: Prefix
            backend:
              service:
                name: ${SERVICE_NAME}
                port:
                  number: ${CONTAINER_PORT}
```

### t015-pmds-landing01-fe/deploy/production/.env.example

```
NEXT_PUBLIC_API_BASE_URL=https://pmds-cms-api.vplay.vn/api/Web/
NEXT_PUBLIC_APP_CLIENT_ID=97158af7fd8e46f8
NEXT_PUBLIC_APP_CLIENT_SECRET=***
NEXT_PUBLIC_LOGIN_DOMAIN=https://id.onlive.vn
NEXT_PUBLIC_DOMAIN=https://phongmadaosi.vplay.vn
NEXT_PUBLIC_SECRET_KEY=***
NEXT_PUBLIC_FACEBOOK=https://facebook.com
NEXT_PUBLIC_GROUP=https://facebook.com/groups/bag
NEXT_PUBLIC_TIKTOK=https://tiktok.com
NEXT_PUBLIC_HUB=https://vplay.vn/website-api
NEXT_PUBLIC_GAME_ID=19
NEXT_PUBLIC_WEBSHOP=https://vplay.vn/webshop-api
NEXT_PUBLIC_OIDC=https://id.onlive.vn/api-core/v2/oidc-service
NEXT_PUBLIC_ENV=_SAID
NEXT_PUBLIC_API_SNAKE=https://pmds-cms-api.vplay.vn/api
NEXT_PUBLIC_BASE_IMG=https://website-assets-cdn.vtvlive.vn/web-game/t015
```

### t015-pmds-landing01-fe/deploy/production/deploy.yaml

```yaml
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
data:
  .env: |-
    NEXT_PUBLIC_API_BASE_URL=https://pmds-cms-api.vplay.vn/api/Web/
    NEXT_PUBLIC_APP_CLIENT_ID=b4e6105d65184c17
    NEXT_PUBLIC_APP_CLIENT_SECRET=***
    NEXT_PUBLIC_LOGIN_DOMAIN=https://id.onlive.vn
    NEXT_PUBLIC_DOMAIN=https://phongmadaosi.vplay.vn
    NEXT_PUBLIC_SECRET_KEY=***
    NEXT_PUBLIC_FACEBOOK=https://facebook.com
    NEXT_PUBLIC_GROUP=https://facebook.com/groups/bag
    NEXT_PUBLIC_TIKTOK=https://tiktok.com
    NEXT_PUBLIC_HUB=https://vplay.vn/website-api
    NEXT_PUBLIC_GAME_ID=19
    NEXT_PUBLIC_WEBSHOP=https://vplay.vn/webshop-api
    NEXT_PUBLIC_OIDC=https://id.onlive.vn/api-core/v2/oidc-service
    NEXT_PUBLIC_ENV=_SAID
    NEXT_PUBLIC_API_SNAKE=https://pmds-cms-api.vplay.vn/api
    NEXT_PUBLIC_BASE_IMG=https://website-assets-cdn.vtvlive.vn/web-game/t015
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  selector:
    matchLabels:
      service: ${SERVICE_NAME}
  replicas: 3
  template:
    metadata:
      labels:
        service: ${SERVICE_NAME}
        logger: nlog
      annotations:
    spec:
      terminationGracePeriodSeconds: 60
      containers:
        - name: ${SERVICE_NAME}
          image: ${IMAGE}
          ports:
            - containerPort: ${CONTAINER_PORT}
          volumeMounts:
            - name: ${SERVICE_NAME}
              mountPath: /usr/src/app/.env
              subPath: .env
      nodeSelector:
      imagePullSecrets:
        - name: registry
      restartPolicy: Always
      volumes:
        - name: ${SERVICE_NAME}
          configMap:
            name: ${SERVICE_NAME}
---
apiVersion: v1
kind: Service
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  ports:
    - port: ${CONTAINER_PORT}
      protocol: TCP
  selector:
    service: ${SERVICE_NAME}
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
  annotations:
    kubernetes.io/ingress.class: nginx
    # nginx.ingress.kubernetes.io/rewrite-target: /$2
spec:
  rules:
    - host: ${DOMAIN}
      http:
        paths:
          - path: ${SERVICE_PATH}
            pathType: Prefix
            backend:
              service:
                name: ${SERVICE_NAME}
                port:
                  number: ${CONTAINER_PORT}
```

### t015-pmds-landing01-fe/deploy/staging/deploy.yaml

```yaml
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
data:
  .env: |-

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  selector:
    matchLabels:
      service: ${SERVICE_NAME}
  replicas: 1
  template:
    metadata:
      labels:
        service: ${SERVICE_NAME}
        logger: nlog
      annotations:
    spec:
      terminationGracePeriodSeconds: 60
      containers:
        - name: ${SERVICE_NAME}
          image: ${IMAGE}
          env:
            - name: TZ
              value: Etc/GMT-7
          ports:
            - containerPort: ${CONTAINER_PORT}
          volumeMounts:
            - name: ${SERVICE_NAME}
              mountPath: /usr/src/app/.env
              subPath: .env
      nodeSelector:
      imagePullSecrets:
        - name: registry
      restartPolicy: Always
      volumes:
        - name: ${SERVICE_NAME}
          configMap:
            name: ${SERVICE_NAME}
---
apiVersion: v1
kind: Service
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  ports:
    - port: ${CONTAINER_PORT}
      protocol: TCP
  selector:
    service: ${SERVICE_NAME}
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
  annotations:
    kubernetes.io/ingress.class: nginx
spec:
  rules:
    - host: ${DOMAIN}
      http:
        paths:
          - path: ${SERVICE_PATH}(/|$)(.*)
            pathType: Prefix
            backend:
              service:
                name: ${SERVICE_NAME}
                port:
                  number: ${CONTAINER_PORT}
```

### t015-pmds-landing01-fe/deploy/testing/deploy.yaml

_Giống hệt `dau-than-tuyet-the/t010-website-homepage/deploy/testing/deploy.yaml`._

---

## phuong-hoang-tru-tien

### home-page/Dockerfile

```dockerfile
FROM node:22.15.1-alpine3.20
WORKDIR /usr/src/app
ARG DEPLOY

COPY package*.json ./

RUN npm install

COPY . .
COPY deploy/${DEPLOY}/.env.example ./.env

RUN npm run build


EXPOSE 3000
CMD ["npm", "run", "dev"]
```

### home-page/Jenkinsfile

```groovy
@Library('jenkins-libs') _
VTVliveVplayNodeJSautodev(domain:"phuonghoangtrutien.vplay.vn",container_port:"3000",service_path:"/",namespace:"vplay",service_name:"t029-homepage")
```

### home-page/deploy/develop/.env.example

```
VITE_APP_GAME_NAME=T029
VITE_APP_CLIENT_ID=0cfe3f835b054b50
VITE_APP_CLIENT_SECRET=***
VITE_APP_LOGIN_DOMAIN=https://dev-id.onlive.vn
VITE_APP_DOMAIN=https://dev-phuonghoangtrutien.vplay.vn
VITE_APP_HUB=https://dev.vplay.vn/website-api
VITE_APP_GAME_ID=1044
VITE_APP_OIDC=https://dev-id.onlive.vn/api-core/v2/oidc-service
VITE_APP_ENV=development._SAID

VITE_APP_REDIRECT_URL=/callback
VITE_APP_API_GAME_SERVICES=https://dev-game-services-api.vplay.vn/api

# VITE_APP_ENV=server

# VITE_APP_CDN_IMAGE=https://website-assets-cdn.vtvlive.vn/web-game/t024/landing
VITE_APP_CDN_IMAGE=''
```

### home-page/deploy/develop/deploy.yaml

```yaml
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
data:
  .env: |-
    VITE_APP_GAME_NAME=T029
    VITE_APP_CLIENT_ID=0cfe3f835b054b50
    VITE_APP_CLIENT_SECRET=***
    VITE_APP_LOGIN_DOMAIN=https://dev-id.onlive.vn
    VITE_APP_DOMAIN=https://dev-phuonghoangtrutien.vplay.vn
    VITE_APP_HUB=https://dev.vplay.vn/website-api
    VITE_APP_GAME_ID=1044
    VITE_APP_OIDC=https://dev-id.onlive.vn/api-core/v2/oidc-service
    VITE_APP_ENV=development._SAID

    VITE_APP_REDIRECT_URL=/callback
    VITE_APP_API_GAME_SERVICES=https://dev-game-services-api.vplay.vn/api
    VITE_APP_CDN_IMAGE=''

---
apiVersion: apps/v1
kind: Deployment

metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}

spec:
  selector:
    matchLabels:
      service: ${SERVICE_NAME}

  replicas: 1

  template:
    metadata:
      labels:
        service: ${SERVICE_NAME}
        logger: nlog

    spec:
      terminationGracePeriodSeconds: 60

      containers:
        - name: ${SERVICE_NAME}
          image: ${IMAGE}

          env:
            - name: TZ
              value: Etc/GMT-7

          ports:
            - containerPort: ${CONTAINER_PORT}

          volumeMounts:
            - name: ${SERVICE_NAME}
              mountPath: /usr/src/app/.env
              subPath: .env   

      imagePullSecrets:
        - name: registry
      restartPolicy: Always
      volumes:
        - name: ${SERVICE_NAME}
          configMap:
            name: ${SERVICE_NAME}

---
apiVersion: v1
kind: Service
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  ports:
    - port: ${CONTAINER_PORT}
      protocol: TCP
  selector:
    service: ${SERVICE_NAME}
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
  annotations:
    kubernetes.io/ingress.class: nginx
spec:
  rules:
    - host: ${DOMAIN}
      http:
        paths:
          - path: ${SERVICE_PATH}
            pathType: Prefix
            backend:
              service:
                name: ${SERVICE_NAME}
                port:
                  number: ${CONTAINER_PORT}
      http:
        paths:
          - path: ${SERVICE_PATH}
            pathType: Prefix
            backend:
              service:
                name: ${SERVICE_NAME}
                port:
                  number: ${CONTAINER_PORT}
```

### home-page/deploy/production/.env.example

```
VITE_APP_GAME_NAME=T029
VITE_APP_CLIENT_ID=97158af7fd8e46f8
VITE_APP_CLIENT_SECRET=***
VITE_APP_LOGIN_DOMAIN=https://id.onlive.vn
VITE_APP_DOMAIN=https://phuonghoangtrutien.vplay.vn
VITE_APP_HUB=https://vplay.vn/website-api
VITE_APP_GAME_ID=35
VITE_APP_OIDC=https://id.onlive.vn/api-core/v2/oidc-service
VITE_APP_ENV=_SAID

VITE_APP_REDIRECT_URL=/callback
VITE_APP_API_GAME_SERVICES=https://game-services-api.vplay.vn/api

# VITE_APP_ENV=server

# VITE_APP_CDN_IMAGE=https://website-assets-cdn.vtvlive.vn/web-game/t024/landing
VITE_APP_CDN_IMAGE=''
```

### home-page/deploy/production/deploy.yaml

```yaml

---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
data:
  .env: |-
    VITE_APP_GAME_NAME=T029
    VITE_APP_CLIENT_ID=97158af7fd8e46f8
    VITE_APP_CLIENT_SECRET=***
    VITE_APP_LOGIN_DOMAIN=https://id.onlive.vn
    VITE_APP_DOMAIN=https://phuonghoangtrutien.vplay.vn
    VITE_APP_HUB=https://vplay.vn/website-api
    VITE_APP_GAME_ID=35
    VITE_APP_OIDC=https://id.onlive.vn/api-core/v2/oidc-service
    VITE_APP_ENV=_SAID

    VITE_APP_REDIRECT_URL=/callback
    VITE_APP_API_GAME_SERVICES=https://game-services-api.vplay.vn/api
    VITE_APP_CDN_IMAGE=''

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  selector:
    matchLabels:
      service: ${SERVICE_NAME}
  replicas: 1
  template:
    metadata:
      labels:
        service: ${SERVICE_NAME}
        logger: nlog
      annotations:
    spec:
      terminationGracePeriodSeconds: 60
      containers:
        - name: ${SERVICE_NAME}
          image: ${IMAGE}
          env:
            - name: TZ
              value: Etc/GMT-7
          ports:
            - containerPort: ${CONTAINER_PORT}
          volumeMounts:
            - name: ${SERVICE_NAME}
              mountPath: /usr/src/app/.env
              subPath: .env 

      imagePullSecrets:
        - name: registry
      volumes:
        - name: ${SERVICE_NAME}
          configMap:
            name: ${SERVICE_NAME}
      restartPolicy: Always
---
apiVersion: v1
kind: Service
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  ports:
    - port: ${CONTAINER_PORT}
      protocol: TCP
  selector:
    service: ${SERVICE_NAME}
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
  annotations:
    kubernetes.io/ingress.class: nginx
spec:
  rules:
    - host: ${DOMAIN}
      http:
        paths:
          - path: ${SERVICE_PATH}
            pathType: Prefix
            backend:
              service:
                name: ${SERVICE_NAME}
                port:
                  number: ${CONTAINER_PORT}
      http:
        paths:
          - path: ${SERVICE_PATH}
            pathType: Prefix
            backend:
              service:
                name: ${SERVICE_NAME}
                port:
                  number: ${CONTAINER_PORT}
```

---

## quy-mon-quan

### homepage-va-conhan-web/deploy/develop/.env.example

```
NEXT_PUBLIC_HUB=https://dev.vplay.vn/website-api
NEXT_PUBLIC_HUB_GAME_ID=1036
NEXT_PUBLIC_RANKING_API=https://dev-game-services-api.vplay.vn/api
NEXT_PUBLIC_RANKING_GAME_ID=29
```

### homepage-va-conhan/Dockerfile

```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
#ARG BUILD_MODE
WORKDIR /vtvlive/src/app
COPY . .
RUN dotnet build "R015_Home_And_Conhan.csproj" -o /app/build

FROM build AS publish
ARG BUILD_MODE
RUN dotnet publish "R015_Home_And_Conhan.csproj" -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS final
WORKDIR /app
EXPOSE 8080
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "R015_Home_And_Conhan.dll"]
```

### homepage-va-conhan/Jenkinsfile

```groovy
@Library('jenkins-libs') _
VTVLiveVplayNetcoreautodev(domain:"quymonquan.vplay.vn",container_port:"8080",service_path:"/",namespace:"vplay",service_name:"r015-quymonquan-homepage")
```

### homepage-va-conhan/deploy/develop/deploy.yaml

```yaml
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
data:  
  appsettings.json: |-
    {
      "ConnectionStrings": {
        "CoreConnection": "Server=10.53.10.244;Database=TranInput_REP; User Id=t022;Password=***;MultipleActiveResultSets=true;TrustServerCertificate=True",
        "DefaultConnection": "Server=10.53.10.244;Database=T022_ThoiKhongChiMong;User Id=t022;Password=***;MultipleActiveResultSets=true;TrustServerCertificate=True",
        "RedisConnection": "10.54.10.64:6379"
      },
      "SiteSettings": {
        "AppId": "1036",
        "AppClientId": "0cfe3f835b054b50",
        "AppClientSecret": "***",
        "HubUrl": "https://dev.vplay.vn/website-api",
        "WebShopUrl": "https://dev.vplay.vn/webshop-api",
        "OidcUrl": "https://dev-id.onlive.vn/api-core/v2/oidc-service/oauth2",
        "PublicUrl": "https://dev-thoikhongchimong.vplay.vn",
        "ServiceUrl": "https://dev-game-services-api.vplay.vn/api",
        "CoreSmsUrl": "https://payment-public-dev-api.onlivetv.vn/api",
        "CoreSmsSecret": "***",
        "DayCountForReport": 365,
        "SecretKey": "***",
        "Environment": "Dev",
        "GifcodeMappings": [
          {
            "Page": "LandingConhan",
            "Group": 1,
            "HubGiftCodeId": 1178
          },
          {
            "Page": "LandingConhan",
            "Group": 2,
            "HubGiftCodeId": 1173
          },
          {
            "Page": "LandingConhan",
            "Group": 3,
            "HubGiftCodeId": 1174
          },
          {
            "Page": "LandingConhan",
            "Group": 4,
            "HubGiftCodeId": 1175
          },
          {
            "Page": "LandingConhan",
            "Group": 5,
            "HubGiftCodeId": 1176
          },
          {
            "Page": "LandingConhan",
            "Group": 6,
            "HubGiftCodeId": 1177
          },
          {
            "Page": "LandingRobot",
            "Group": 1,
            "HubGiftCodeId": 1179
          },
          {
            "Page": "LandingRobot",
            "Group": 2,
            "HubGiftCodeId": 1180
          },
          {
            "Page": "LandingRobot",
            "Group": 3,
            "HubGiftCodeId": 1181
          },
          {
            "Page": "LandingRobot",
            "Group": 4,
            "HubGiftCodeId": 1182
          },
          {
            "Page": "LandingRobot",
            "Group": 5,
            "HubGiftCodeId": 1183
          },
          {
            "Page": "LandingRobot",
            "Group": 6,
            "HubGiftCodeId": 1184
          },
          {
            "Page": "LandingRobot",
            "Group": 7,
            "HubGiftCodeId": 1185
          },
          {
            "Page": "LandingRobot",
            "Group": 8,
            "HubGiftCodeId": 1186
          },
          {
            "Page": "ConhanSms",
            "Group": 1,
            "HubGiftCodeId": 1186
          }
        ]
      },
      "Logging": {
        "LogLevel": {
          "Default": "Information",
          "Microsoft.AspNetCore": "Warning"
        }
      },
      "AllowedHosts": "*"
    }



---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  selector:
    matchLabels:
      service: ${SERVICE_NAME}
  replicas: 1
  template:
    metadata:
      labels:
        service: ${SERVICE_NAME}
        logger: nlog
      annotations:
    spec:
      terminationGracePeriodSeconds: 60
      containers:
      - name: ${SERVICE_NAME}
        image: ${IMAGE}
        env:
        - name: TZ
          value: Etc/GMT-7
        - name: ASPNETCORE_ENVIRONMENT
          value: Development
        ports:
        - containerPort: ${CONTAINER_PORT}
        volumeMounts:
          - name: ${SERVICE_NAME}
            mountPath: /app/appsettings.json
            subPath: appsettings.json
      nodeSelector:
      imagePullSecrets:
      - name: registry
      restartPolicy: Always
      volumes:
      - name: ${SERVICE_NAME}
        configMap: 
          name: ${SERVICE_NAME}
---
apiVersion: v1
kind: Service
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  ports:
  - port: ${CONTAINER_PORT}
    protocol: TCP
  selector:
    service: ${SERVICE_NAME}
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name:  ${SERVICE_NAME}
  namespace: ${NAMESPACE}
  annotations:
    kubernetes.io/ingress.class: nginx
    #nginx.ingress.kubernetes.io/rewrite-target: /$2
spec:
  rules:
  - host: ${DOMAIN}
    http:
      paths:
      - path: ${SERVICE_PATH}
        pathType: Prefix
        backend:
          service:
            name: ${SERVICE_NAME}
            port:
              number: ${CONTAINER_PORT}
```

### homepage-va-conhan/deploy/production/deploy.yaml

```yaml
---

apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  dataFrom:
    - extract:
        key: ***
  refreshInterval: 15s
  secretStoreRef:
    kind: ClusterSecretStore
    name: secretstore-vplay
  target:
    name: ${SERVICE_NAME}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  selector:
    matchLabels:
      service: ${SERVICE_NAME}
  replicas: 3
  template:
    metadata:
      labels:
        service: ${SERVICE_NAME}
        logger: nlog
      annotations:
        reloader.stakater.com/auto: "true"
    spec:
      terminationGracePeriodSeconds: 60
      containers:
        - name: ${SERVICE_NAME}
          image: ${IMAGE}
          env:
            - name: TZ
              value: Etc/GMT-7
          # envFrom:
          #   - configMapRef:
          #       name: ${SERVICE_NAME}
          ports:
            - containerPort: ${CONTAINER_PORT}
          volumeMounts:
            - name: ${SERVICE_NAME}
              mountPath: /app/appsettings.json
              subPath: appsettings.json
      nodeSelector:
      imagePullSecrets:
        - name: registry
      restartPolicy: Always
      volumes:
        - name: ${SERVICE_NAME}
          secret:
           secretName: ${SERVICE_NAME}
---
apiVersion: v1
kind: Service
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  ports:
    - port: ${CONTAINER_PORT}
      protocol: TCP
  selector:
    service: ${SERVICE_NAME}
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
  annotations:
    kubernetes.io/ingress.class: nginx
spec:
  rules:
    - host: ${DOMAIN}
      http:
        paths:
          - path: ${SERVICE_PATH}
            pathType: Prefix
            backend:
              service:
                name: ${SERVICE_NAME}
                port:
                  number: ${CONTAINER_PORT}
```

---

## samkok-tamquoc

### t028-samkok-tam-qu-c-home-and-landing-web/deploy/develop/.env.example

```
NEXT_PUBLIC_HUB=https://dev.vplay.vn/website-api
NEXT_PUBLIC_HUB_GAME_ID=34
NEXT_PUBLIC_RANKING_API=https://dev-game-services-api.vplay.vn/api
NEXT_PUBLIC_RANKING_GAME_ID=34
```

### t028-samkok-tam-qu-c-home-and-landing/Dockerfile

```dockerfile

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
ARG BUILD_MODE
WORKDIR /vtvlive/src/app
COPY . .

#RUN dotnet restore "Affiliate API.csproj"

RUN dotnet build "T028 HomeAndLanding.csproj" -c $BUILD_MODE -o /app/build

FROM build AS publish
ARG BUILD_MODE
RUN dotnet publish "T028 HomeAndLanding.csproj" -c $BUILD_MODE -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
EXPOSE 8080
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "T028 HomeAndLanding.dll"]
```

### t028-samkok-tam-qu-c-home-and-landing/Jenkinsfile

```groovy
@Library('jenkins-libs') _
VTVLiveVplayNetcoreautodev(domain:"samkoktamquoc.vplay.vn",container_port:"8080",service_path:"/",namespace:"vplay",service_name:"t028-home-and-landing")
```

### t028-samkok-tam-qu-c-home-and-landing/deploy/develop/deploy.yaml

```yaml
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
data:
  appsettings.json: |-
    {
      "SiteSettings": {
        "AppHubId": 34
      },
      "Logging": {
        "LogLevel": {
          "Default": "Information",
          "Microsoft.AspNetCore": "Warning"
        }
      },
      "AllowedHosts": "*"
    }
     
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  selector:
    matchLabels:
      service: ${SERVICE_NAME}
  replicas: 1
  template:
    metadata:
      labels:
        service: ${SERVICE_NAME}
        logger: nlog
      annotations:
    spec:
      terminationGracePeriodSeconds: 60
      containers:
      - name: ${SERVICE_NAME}
        image: ${IMAGE}
        env:
        - name: TZ
          value: Etc/GMT-7
        - name: ASPNETCORE_ENVIRONMENT
          value: Development
        ports:
        - containerPort: ${CONTAINER_PORT}
        volumeMounts:
          - name: ${SERVICE_NAME}
            mountPath: /app/appsettings.json
            subPath: appsettings.json
      nodeSelector:
      imagePullSecrets:
      - name: registry
      restartPolicy: Always
      volumes:
      - name: ${SERVICE_NAME}
        configMap:
          name: ${SERVICE_NAME}
---
apiVersion: v1
kind: Service
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  ports:
  - port: ${CONTAINER_PORT}
    protocol: TCP
  selector:
    service: ${SERVICE_NAME}
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name:  ${SERVICE_NAME}
  namespace: ${NAMESPACE}
  annotations:
    kubernetes.io/ingress.class: nginx
    # nginx.ingress.kubernetes.io/rewrite-target: /$2
spec:
  rules:
  - host: ${DOMAIN}
    http:
      paths:
      - path: ${SERVICE_PATH}
        pathType: Prefix
        backend:
          service:
            name: ${SERVICE_NAME}
            port:
              number: ${CONTAINER_PORT}
```

### t028-samkok-tam-qu-c-home-and-landing/deploy/production/deploy.yaml

```yaml
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
data:
  appsettings.json: |-
    {
      "SiteSettings": {
        "AppHubId": 34
      },
      "Logging": {
        "LogLevel": {
          "Default": "Information",
          "Microsoft.AspNetCore": "Warning"
        }
      },
      "AllowedHosts": "*"
    }
     
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  selector:
    matchLabels:
      service: ${SERVICE_NAME}
  replicas: 3
  template:
    metadata:
      labels:
        service: ${SERVICE_NAME}
        logger: nlog
      annotations:
    spec:
      terminationGracePeriodSeconds: 60
      containers:
      - name: ${SERVICE_NAME}
        image: ${IMAGE}
        env:
        - name: TZ
          value: Etc/GMT-7
        - name: ASPNETCORE_ENVIRONMENT
          value: Development
        ports:
        - containerPort: ${CONTAINER_PORT}
        volumeMounts:
          - name: ${SERVICE_NAME}
            mountPath: /app/appsettings.json
            subPath: appsettings.json
      nodeSelector:
      imagePullSecrets:
      - name: registry
      restartPolicy: Always
      volumes:
      - name: ${SERVICE_NAME}
        configMap:
          name: ${SERVICE_NAME}
---
apiVersion: v1
kind: Service
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  ports:
  - port: ${CONTAINER_PORT}
    protocol: TCP
  selector:
    service: ${SERVICE_NAME}
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name:  ${SERVICE_NAME}
  namespace: ${NAMESPACE}
  annotations:
    kubernetes.io/ingress.class: nginx
    # nginx.ingress.kubernetes.io/rewrite-target: /$2
spec:
  rules:
  - host: ${DOMAIN}
    http:
      paths:
      - path: ${SERVICE_PATH}
        pathType: Prefix
        backend:
          service:
            name: ${SERVICE_NAME}
            port:
              number: ${CONTAINER_PORT}
```

---

## ta-la-hac-ngokhong

### t031-home-page-web/deploy/develop/.env.example

```
NEXT_PUBLIC_HUB=https://dev.vplay.vn/website-api
NEXT_PUBLIC_HUB_GAME_ID=1044
NEXT_PUBLIC_RANKING_API=https://dev-game-services-api.vplay.vn/api
NEXT_PUBLIC_RANKING_GAME_ID=1044
```

### t031-home-page/Dockerfile

```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS restore
WORKDIR /src

COPY ["T031HomePage.csproj", "./"]
RUN dotnet restore "T031HomePage.csproj"

FROM restore AS publish
ARG BUILD_MODE=Release

COPY . .
RUN dotnet publish "T031HomePage.csproj" \
    --configuration "$BUILD_MODE" \
    --output /app/publish \
    --no-restore \
    /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

ENV ASPNETCORE_HTTP_PORTS=8080 \
    DOTNET_EnableDiagnostics=0

EXPOSE 8080

COPY --from=publish /app/publish .

USER 1654:1654

ENTRYPOINT ["dotnet", "T031HomePage.dll"]
```

### t031-home-page/Jenkinsfile

```groovy
@Library('jenkins-libs') _
VTVLiveVplayNetcoreautodev(domain:"talahacngokhong.vplay.vn",
                            container_port:"8080",
                            service_path:"/",
                            namespace:"vplay",
                            service_name:"t031-home-page")
```

### t031-home-page/deploy/develop/deploy.yaml

```yaml
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
  labels:
    app.kubernetes.io/name: ${SERVICE_NAME}
    app.kubernetes.io/environment: develop
data:
  appsettings.json: |-
    {
      "Logging": {
        "LogLevel": {
          "Default": "Information",
          "Microsoft.AspNetCore": "Warning"
        }
      },
      "VPlayApi": {
        "HubBaseUrl": "https://dev.vplay.vn/website-api",
        "GameServicesBaseUrl": "https://dev-game-services-api.vplay.vn/api",
        "GameId": 1044,
        "LanguageName": "vi"
      },
      "AllowedHosts": "*"
    }

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
  annotations:
    reloader.stakater.com/auto: "true"
  labels:
    app.kubernetes.io/name: ${SERVICE_NAME}
    app.kubernetes.io/environment: develop
spec:
  replicas: 1
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      service: ${SERVICE_NAME}
  template:
    metadata:
      labels:
        service: ${SERVICE_NAME}
        app.kubernetes.io/name: ${SERVICE_NAME}
        app.kubernetes.io/environment: develop
    spec:
      terminationGracePeriodSeconds: 60
      imagePullSecrets:
        - name: registry
      containers:
        - name: ${SERVICE_NAME}
          image: ${IMAGE}
          imagePullPolicy: IfNotPresent
          env:
            - name: TZ
              value: Asia/Ho_Chi_Minh
            - name: ASPNETCORE_ENVIRONMENT
              value: Development
            - name: ASPNETCORE_FORWARDEDHEADERS_ENABLED
              value: "true"
            - name: ASPNETCORE_HTTP_PORTS
              value: "8080"
          volumeMounts:
            - name: appsettings
              mountPath: /app/appsettings.json
              subPath: appsettings.json
              readOnly: true
          ports:
            - name: http
              containerPort: ${CONTAINER_PORT}
              protocol: TCP
          readinessProbe:
            tcpSocket:
              port: http
            initialDelaySeconds: 10
            periodSeconds: 10
            timeoutSeconds: 2
            failureThreshold: 6
          livenessProbe:
            tcpSocket:
              port: http
            initialDelaySeconds: 30
            periodSeconds: 20
            timeoutSeconds: 2
            failureThreshold: 3
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: 1000m
              memory: 1Gi
          securityContext:
            allowPrivilegeEscalation: false
            runAsNonRoot: true
            runAsUser: 1654
            runAsGroup: 1654
            capabilities:
              drop:
                - ALL
            seccompProfile:
              type: RuntimeDefault
      volumes:
        - name: appsettings
          configMap:
            name: ${SERVICE_NAME}
            defaultMode: 0444
            items:
              - key: appsettings.json
                path: appsettings.json
      restartPolicy: Always

---
apiVersion: v1
kind: Service
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
  labels:
    app.kubernetes.io/name: ${SERVICE_NAME}
    app.kubernetes.io/environment: develop
spec:
  selector:
    service: ${SERVICE_NAME}
  ports:
    - name: http
      port: ${CONTAINER_PORT}
      targetPort: http
      protocol: TCP

---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
  labels:
    app.kubernetes.io/name: ${SERVICE_NAME}
    app.kubernetes.io/environment: develop
  annotations:
    nginx.ingress.kubernetes.io/proxy-body-size: "50m"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "300"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "300"
spec:
  ingressClassName: nginx
  rules:
    - host: ${DOMAIN}
      http:
        paths:
          - path: ${SERVICE_PATH}
            pathType: Prefix
            backend:
              service:
                name: ${SERVICE_NAME}
                port:
                  number: ${CONTAINER_PORT}
```

### t031-home-page/deploy/production/deploy.yaml

```yaml
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
  labels:
    app.kubernetes.io/name: ${SERVICE_NAME}
    app.kubernetes.io/environment: production
data:
  appsettings.json: |-
    {
      "Logging": {
        "LogLevel": {
          "Default": "Information",
          "Microsoft.AspNetCore": "Warning"
        }
      },
      "VPlayApi": {
        "HubBaseUrl": "https://vplay.vn/website-api",
        "GameServicesBaseUrl": "https://game-services-api.vplay.vn/api",
        "GameId": 43,
        "LanguageName": "vi"
      },
      "AllowedHosts": "*"
    }

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
  annotations:
    reloader.stakater.com/auto: "true"
  labels:
    app.kubernetes.io/name: ${SERVICE_NAME}
    app.kubernetes.io/environment: production
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      service: ${SERVICE_NAME}
  template:
    metadata:
      labels:
        service: ${SERVICE_NAME}
        app.kubernetes.io/name: ${SERVICE_NAME}
        app.kubernetes.io/environment: production
    spec:
      terminationGracePeriodSeconds: 60
      imagePullSecrets:
        - name: registry
      containers:
        - name: ${SERVICE_NAME}
          image: ${IMAGE}
          imagePullPolicy: IfNotPresent
          env:
            - name: TZ
              value: Asia/Ho_Chi_Minh
            - name: ASPNETCORE_ENVIRONMENT
              value: Production
            - name: ASPNETCORE_FORWARDEDHEADERS_ENABLED
              value: "true"
            - name: ASPNETCORE_HTTP_PORTS
              value: "8080"
          volumeMounts:
            - name: appsettings
              mountPath: /app/appsettings.json
              subPath: appsettings.json
              readOnly: true
          ports:
            - name: http
              containerPort: ${CONTAINER_PORT}
              protocol: TCP
          readinessProbe:
            tcpSocket:
              port: http
            initialDelaySeconds: 10
            periodSeconds: 10
            timeoutSeconds: 2
            failureThreshold: 6
          livenessProbe:
            tcpSocket:
              port: http
            initialDelaySeconds: 30
            periodSeconds: 20
            timeoutSeconds: 2
            failureThreshold: 3
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: 1000m
              memory: 1Gi
          securityContext:
            allowPrivilegeEscalation: false
            runAsNonRoot: true
            runAsUser: 1654
            runAsGroup: 1654
            capabilities:
              drop:
                - ALL
            seccompProfile:
              type: RuntimeDefault
      volumes:
        - name: appsettings
          configMap:
            name: ${SERVICE_NAME}
            defaultMode: 0444
            items:
              - key: appsettings.json
                path: appsettings.json
      restartPolicy: Always

---
apiVersion: v1
kind: Service
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
  labels:
    app.kubernetes.io/name: ${SERVICE_NAME}
    app.kubernetes.io/environment: production
spec:
  selector:
    service: ${SERVICE_NAME}
  ports:
    - name: http
      port: ${CONTAINER_PORT}
      targetPort: http
      protocol: TCP

---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
  labels:
    app.kubernetes.io/name: ${SERVICE_NAME}
    app.kubernetes.io/environment: production
  annotations:
    nginx.ingress.kubernetes.io/proxy-body-size: "50m"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "300"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "300"
spec:
  ingressClassName: nginx
  rules:
    - host: ${DOMAIN}
      http:
        paths:
          - path: ${SERVICE_PATH}
            pathType: Prefix
            backend:
              service:
                name: ${SERVICE_NAME}
                port:
                  number: ${CONTAINER_PORT}
```

---

## tamquoc-daiminhtinh

### t037-home-landing/Dockerfile

```dockerfile
FROM node:22.15.1-alpine3.20
WORKDIR /usr/src/app
ARG DEPLOY=production
ENV __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=tamquocdaiminhtinh.vplay.vn,dev-tamquocdaiminhtinh.vplay.vn

COPY package*.json ./

RUN npm ci

COPY . .
COPY deploy/${DEPLOY}/.env.example ./.env

RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "dev"]
```

### t037-home-landing/Jenkinsfile

```groovy
@Library('jenkins-libs') _
VTVliveVplayNodeJSautodev(domain:"tamquocdaiminhtinh.vplay.vn",
                            container_port:"3000",
                            service_path:"/",
                            namespace:"vplay",
                            service_name:"t037-homepage"
                        )
```

### t037-home-landing/deploy/develop/.env.example

```
VITE_APP_GAME_NAME=T037
VITE_APP_CLIENT_ID=0cfe3f835b054b50
VITE_APP_CLIENT_SECRET=***
VITE_APP_LOGIN_DOMAIN=https://dev-id.onlive.vn
VITE_APP_ENV=development._SAID
VITE_APP_OIDC=https://dev-id.onlive.vn/api-core/v2/oidc-service
VITE_APP_DOMAIN=https://dev-tamquocdaiminhtinh.vplay.vn
VITE_APP_HUB=https://dev.vplay.vn/website-api
VITE_APP_GAME_ID=1041
VITE_APP_SERVICE_PATH=/
VITE_APP_REDIRECT_URL=/callback
VITE_APP_API_GAME_SERVICES=https://dev-game-services-api.vplay.vn/api
VITE_APP_SITE_ID=01a0a809-dff4-7166-810f-fdf7ecb3973b
VITE_APP_CLIENT_ID_GAME=9cd83e04f1e1451c
VITE_APP_CDN_IMAGE=''
```

### t037-home-landing/deploy/develop/deploy.yaml

```yaml
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
data:
  .env: |-
    VITE_APP_GAME_NAME=T037
    VITE_APP_CLIENT_ID=0cfe3f835b054b50
    VITE_APP_CLIENT_SECRET=***
    VITE_APP_LOGIN_DOMAIN=https://dev-id.onlive.vn
    VITE_APP_ENV=development._SAID
    VITE_APP_OIDC=https://dev-id.onlive.vn/api-core/v2/oidc-service
    VITE_APP_DOMAIN=https://dev-tamquocdaiminhtinh.vplay.vn
    VITE_APP_HUB=https://dev.vplay.vn/website-api
    VITE_APP_GAME_ID=1041
    VITE_APP_SERVICE_PATH=/
    VITE_APP_REDIRECT_URL=/callback
    VITE_APP_API_GAME_SERVICES=https://dev-game-services-api.vplay.vn/api
    VITE_APP_SITE_ID=01a0a809-dff4-7166-810f-fdf7ecb3973b
    VITE_APP_CLIENT_ID_GAME=9cd83e04f1e1451c
    VITE_APP_CDN_IMAGE=''
---
apiVersion: apps/v1
kind: Deployment

metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}

spec:
  selector:
    matchLabels:
      service: ${SERVICE_NAME}

  replicas: 1

  template:
    metadata:
      labels:
        service: ${SERVICE_NAME}
        logger: nlog
    spec:
      terminationGracePeriodSeconds: 60

      containers:
        - name: ${SERVICE_NAME}
          image: ${IMAGE}

          env:
            - name: TZ
              value: Etc/GMT-7
            - name: NODE_OPTIONS
              value: --max-old-space-size=384

          ports:
            - containerPort: ${CONTAINER_PORT}
          volumeMounts:
            - name: ${SERVICE_NAME}
              mountPath: /usr/src/app/.env
              subPath: .env
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 512Mi

      imagePullSecrets:
        - name: registry
      volumes:
        - name: ${SERVICE_NAME}
          configMap:
            name: ${SERVICE_NAME}
      restartPolicy: Always

---
apiVersion: v1
kind: Service
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  ports:
    - port: ${CONTAINER_PORT}
      targetPort: ${CONTAINER_PORT}
      protocol: TCP
  selector:
    service: ${SERVICE_NAME}
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
  annotations:
    kubernetes.io/ingress.class: nginx
spec:
  rules:
    - host: ${DOMAIN}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: ${SERVICE_NAME}
                port:
                  number: ${CONTAINER_PORT}
```

### t037-home-landing/deploy/production/.env.example

```
VITE_APP_GAME_NAME=T037
VITE_APP_CLIENT_ID=97158af7fd8e46f8
VITE_APP_CLIENT_SECRET=***
VITE_APP_LOGIN_DOMAIN=https://id.onlive.vn
VITE_APP_ENV=_SAID
VITE_APP_OIDC=https://id.onlive.vn/api-core/v2/oidc-service
VITE_APP_DOMAIN=https://tamquocdaiminhtinh.vplay.vn
VITE_APP_HUB=https://vplay.vn/website-api
VITE_APP_GAME_ID=1041
VITE_APP_SERVICE_PATH=/
VITE_APP_REDIRECT_URL=/callback
VITE_APP_API_GAME_SERVICES=https://game-services-api.vplay.vn/api
VITE_APP_SITE_ID=01a0a809-dff4-7166-810f-fdf7ecb3973b
VITE_APP_CLIENT_ID_GAME=9cd83e04f1e1451c
VITE_APP_CDN_IMAGE=''
```

### t037-home-landing/deploy/production/deploy.yaml

```yaml

---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
data:
  .env: |-
    VITE_APP_GAME_NAME=T037
    VITE_APP_CLIENT_ID=97158af7fd8e46f8
    VITE_APP_CLIENT_SECRET=***
    VITE_APP_LOGIN_DOMAIN=https://id.onlive.vn
    VITE_APP_ENV=_SAID
    VITE_APP_OIDC=https://id.onlive.vn/api-core/v2/oidc-service
    VITE_APP_DOMAIN=https://tamquocdaiminhtinh.vplay.vn
    VITE_APP_HUB=https://vplay.vn/website-api
    VITE_APP_GAME_ID=1041
    VITE_APP_SERVICE_PATH=/
    VITE_APP_REDIRECT_URL=/callback
    VITE_APP_API_GAME_SERVICES=https://game-services-api.vplay.vn/api
    VITE_APP_SITE_ID=01a0a809-dff4-7166-810f-fdf7ecb3973b
    VITE_APP_CLIENT_ID_GAME=9cd83e04f1e1451c
    VITE_APP_CDN_IMAGE=''
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  selector:
    matchLabels:
      service: ${SERVICE_NAME}
  replicas: 1
  template:
    metadata:
      labels:
        service: ${SERVICE_NAME}
        logger: nlog
    spec:
      terminationGracePeriodSeconds: 60
      containers:
        - name: ${SERVICE_NAME}
          image: ${IMAGE}
          env:
            - name: TZ
              value: Etc/GMT-7
            - name: NODE_OPTIONS
              value: --max-old-space-size=384
          ports:
            - containerPort: ${CONTAINER_PORT}
          volumeMounts:
            - name: ${SERVICE_NAME}
              mountPath: /usr/src/app/.env
              subPath: .env
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 512Mi

      imagePullSecrets:
        - name: registry
      volumes:
        - name: ${SERVICE_NAME}
          configMap:
            name: ${SERVICE_NAME}
      restartPolicy: Always
---
apiVersion: v1
kind: Service
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  ports:
    - port: ${CONTAINER_PORT}
      targetPort: ${CONTAINER_PORT}
      protocol: TCP
  selector:
    service: ${SERVICE_NAME}
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
  annotations:
    kubernetes.io/ingress.class: nginx
spec:
  rules:
    - host: ${DOMAIN}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: ${SERVICE_NAME}
                port:
                  number: ${CONTAINER_PORT}
```

---

## tamquoc-quan-anh

### t203-homepage/Dockerfile

```dockerfile
FROM node:20-alpine
WORKDIR /usr/src/app
ARG DEPLOY

COPY package*.json ./

RUN npm install

COPY . .
COPY deploy/${DEPLOY}/.env.example ./.env

RUN npm run build


EXPOSE 4173
CMD ["npm", "run", "preview"]



# FROM node:20.2-alpine3.16 as build
# WORKDIR /usr/src/app
# ARG DEPLOY
# COPY package*.json ./
# # RUN npm cache clean --force
# # RUN npm cache verify
# RUN apk add git tzdata
# RUN apk add gettext libintl
# ENV TZ="Asia/Ho_Chi_Minh"
# RUN yarn install
# COPY . .
# COPY deploy/${DEPLOY}/.env.example ./.env
# RUN yarn build
# EXPOSE 3000
# CMD ["yarn", "start"]
```

### t203-homepage/Jenkinsfile

```groovy
@Library('jenkins-libs') _
VTVliveVplayNodeJSautodev(domain:"tamquocquananh.vplay.vn",container_port:"4173",service_path:"/",namespace:"vplay",service_name:"t023-homepage")
```

### t203-homepage/deploy/develop/.env.example

```
VITE_APP_API_BASE_URL=https://dev-mobigame-api.onlive.vn/api
VITE_APP_CLIENT_ID=0cfe3f835b054b50
VITE_APP_CLIENT_SECRET=***
VITE_APP_LOGIN_DOMAIN=https://dev-id.onlive.vn
VITE_APP_DOMAIN=http://localhost:3000
VITE_APP_HUB=https://dev.vplay.vn/website-api
VITE_GAME_ID=1040
VITE_APP_REDIRECT_URL=/callback
VITE_APP_API_GAME_SERVICES=https://dev-game-services-api.vplay.vn/api
VITE_APP_SERVICE_PATH=
VITE_APP_CDN_IMAGE=
```

### t203-homepage/deploy/develop/deploy.yaml

```yaml
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
data:
  .env: |-
    VITE_APP_API_BASE_URL=https://dev-mobigame-api.onlive.vn/api
    VITE_APP_CLIENT_ID=0cfe3f835b054b50
    VITE_APP_CLIENT_SECRET=***
    VITE_APP_LOGIN_DOMAIN=https://dev-id.onlive.vn
    VITE_APP_DOMAIN=http://localhost:3000
    VITE_APP_HUB=https://dev.vplay.vn/website-api
    VITE_GAME_ID=1040
    VITE_APP_REDIRECT_URL=/callback
    VITE_APP_API_GAME_SERVICES=https://dev-game-services-api.vplay.vn/api
    VITE_APP_SERVICE_PATH=
    VITE_APP_CDN_IMAGE=https://cdn.vplay.vn

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  selector:
    matchLabels:
      service: ${SERVICE_NAME}
  replicas: 1
  template:
    metadata:
      labels:
        service: ${SERVICE_NAME}
        logger: nlog
      annotations:
    spec:
      terminationGracePeriodSeconds: 60
      containers:
      - name: ${SERVICE_NAME}
        image: ${IMAGE}
        env:
        - name: TZ
          value: Etc/GMT-7
        ports:
        - containerPort: ${CONTAINER_PORT}
        volumeMounts:
          - name: ${SERVICE_NAME}
            mountPath: /usr/src/app/.env
            subPath: .env
      nodeSelector:
      imagePullSecrets:
      - name: registry
      restartPolicy: Always
      volumes:
      - name: ${SERVICE_NAME}
        configMap:
          name: ${SERVICE_NAME}
---
apiVersion: v1
kind: Service
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  ports:
  - port: ${CONTAINER_PORT}
    protocol: TCP
  selector:
    service: ${SERVICE_NAME}
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name:  ${SERVICE_NAME}
  namespace: ${NAMESPACE}
  annotations:
    kubernetes.io/ingress.class: nginx
    # nginx.ingress.kubernetes.io/rewrite-target: /$2
spec:
  rules:
  - host: ${DOMAIN}
    http:
      paths:
      - path: ${SERVICE_PATH}
        pathType: Prefix
        backend:
          service:
            name: ${SERVICE_NAME}
            port:
              number: ${CONTAINER_PORT}
```

### t203-homepage/deploy/production/.env.example

```
VITE_APP_API_BASE_URL=https://mobigame-api.onlive.vn/api
VITE_APP_CLIENT_ID=97158af7fd8e46f8
VITE_APP_CLIENT_SECRET=***
VITE_APP_LOGIN_DOMAIN=https://id.onlive.vn
VITE_APP_DOMAIN=https://tamquocquananh.vplay.vn
VITE_APP_HUB=https://vplay.vn/website-api
VITE_GAME_ID=31
VITE_APP_REDIRECT_URL=/callback
VITE_APP_API_GAME_SERVICES=https://game-services-api.vplay.vn/api
VITE_APP_SERVICE_PATH=
VITE_APP_CDN_IMAGE=
```

### t203-homepage/deploy/production/deploy.yaml

```yaml
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
data:
  .env: |-
    VITE_APP_API_BASE_URL=https://mobigame-api.onlive.vn/api
    VITE_APP_CLIENT_ID=97158af7fd8e46f8
    VITE_APP_CLIENT_SECRET=***
    VITE_APP_LOGIN_DOMAIN=https://id.onlive.vn
    VITE_APP_DOMAIN=https://tamquocquananh.vplay.vn
    VITE_APP_HUB=https://vplay.vn/website-api
    VITE_GAME_ID=31
    VITE_APP_REDIRECT_URL=/callback
    VITE_APP_API_GAME_SERVICES=https://game-services-api.vplay.vn/api
    VITE_APP_SERVICE_PATH=
    VITE_APP_CDN_IMAGE=

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  selector:
    matchLabels:
      service: ${SERVICE_NAME}
  replicas: 2
  template:
    metadata:
      labels:
        service: ${SERVICE_NAME}
        logger: nlog
      annotations:
    spec:
      terminationGracePeriodSeconds: 60
      containers:
      - name: ${SERVICE_NAME}
        image: ${IMAGE}
        env:
        - name: TZ
          value: Etc/GMT-7
        ports:
        - containerPort: ${CONTAINER_PORT}
        volumeMounts:
          - name: ${SERVICE_NAME}
            mountPath: /usr/src/app/.env
            subPath: .env
      nodeSelector:
      imagePullSecrets:
      - name: registry
      restartPolicy: Always
      volumes:
      - name: ${SERVICE_NAME}
        configMap:
          name: ${SERVICE_NAME}
---
apiVersion: v1
kind: Service
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  ports:
  - port: ${CONTAINER_PORT}
    protocol: TCP
  selector:
    service: ${SERVICE_NAME}
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name:  ${SERVICE_NAME}
  namespace: ${NAMESPACE}
  annotations:
    kubernetes.io/ingress.class: nginx
    # nginx.ingress.kubernetes.io/rewrite-target: /$2
spec:
  rules:
  - host: ${DOMAIN}
    http:
      paths:
      - path: ${SERVICE_PATH}
        pathType: Prefix
        backend:
          service:
            name: ${SERVICE_NAME}
            port:
              number: ${CONTAINER_PORT}
```

### t203-homepage/deploy/staging/.env.example

```

```

### t203-homepage/deploy/staging/deploy.yaml

```yaml
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
data:  
  .env: |-
  
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  selector:
    matchLabels:
      service: ${SERVICE_NAME}
  replicas: 1
  template:
    metadata:
      labels:
        service: ${SERVICE_NAME}
        logger: nlog
      annotations:
    spec:
      terminationGracePeriodSeconds: 60
      containers:
      - name: ${SERVICE_NAME}
        image: ${IMAGE}
        env:
        - name: TZ
          value: Etc/GMT-7
        ports:
        - containerPort: ${CONTAINER_PORT}
        volumeMounts:
          - name: ${SERVICE_NAME}
            mountPath: /usr/src/app/.env
            subPath: .env
      nodeSelector:
      imagePullSecrets:
      - name: registry
      restartPolicy: Always
      volumes:
      - name: ${SERVICE_NAME}
        configMap: 
          name: ${SERVICE_NAME}
---
apiVersion: v1
kind: Service
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  ports:
  - port: ${CONTAINER_PORT}
    protocol: TCP
  selector:
    service: ${SERVICE_NAME}
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name:  ${SERVICE_NAME}
  namespace: ${NAMESPACE}
  annotations:
    kubernetes.io/ingress.class: nginx
    nginx.ingress.kubernetes.io/rewrite-target: /$2
spec:
  rules:
  - host: ${DOMAIN}
    http:
      paths:
      - path: ${SERVICE_PATH}(/|$)(.*)
        pathType: Prefix
        backend:
          service:
            name: ${SERVICE_NAME}
            port:
              number: ${CONTAINER_PORT}
```

### t203-homepage/deploy/testing/.env.example

_Giống hệt `tamquoc-quan-anh/t203-homepage/deploy/staging/.env.example`._

### t203-homepage/deploy/testing/deploy.yaml

```yaml
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
data:  
  .env: |-

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  selector:
    matchLabels:
      service: ${SERVICE_NAME}
  replicas: 1
  template:
    metadata:
      labels:
        service: ${SERVICE_NAME}
        logger: nlog
      annotations:
    spec:
      terminationGracePeriodSeconds: 60
      containers:
      - name: ${SERVICE_NAME}
        image: ${IMAGE}
        env:
        - name: TZ
          value: Etc/GMT-7
        ports:
        - containerPort: ${CONTAINER_PORT}
        volumeMounts:
          - name: ${SERVICE_NAME}
            mountPath: /usr/src/app/.env
            subPath: .env
      nodeSelector:
      imagePullSecrets:
      - name: registry
      restartPolicy: Always
      volumes:
      - name: ${SERVICE_NAME}
        configMap: 
          name: ${SERVICE_NAME}
---
apiVersion: v1
kind: Service
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  ports:
  - port: ${CONTAINER_PORT}
    protocol: TCP
  selector:
    service: ${SERVICE_NAME}
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name:  ${SERVICE_NAME}
  namespace: ${NAMESPACE}
  annotations:
    kubernetes.io/ingress.class: nginx
spec:
  rules:
  - host: ${DOMAIN}
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: ${SERVICE_NAME}
            port:
              number: ${CONTAINER_PORT}
```

---

## than-ma-ao-hoa

### t018-than-ma-website/Dockerfile

```dockerfile
FROM node:22.6-alpine
WORKDIR /usr/src/app
ARG DEPLOY
COPY package*.json ./


# RUN npm cache clean --force
# RUN npm cache verify
RUN apk add git tzdata
RUN apk add gettext libintl
ENV TZ="Asia/Ho_Chi_Minh"
RUN npm install

COPY . .
COPY deploy/${DEPLOY}/.env.example ./.env

RUN npm run build


EXPOSE 3000
CMD ["npm","run","start"]
```

### t018-than-ma-website/Jenkinsfile

```groovy
@Library('jenkins-libs') _
VTVliveVplayNodeJS(domain:"thanmaaohoa.vplay.vn",container_port:"3000",service_path:"/",namespace:"vplay",service_name:"t018-landing")
```

### t018-than-ma-website/deploy/develop/.env.example

```
NEXT_PUBLIC_API_BASE_URL=https://dev-thanmaloanvu-api.vplay.vn/api
NEXT_PUBLIC_APP_CLIENT_ID=0cfe3f835b054b50
NEXT_PUBLIC_APP_CLIENT_SECRET=***
NEXT_PUBLIC_LOGIN_DOMAIN=https://dev-id.onlive.vn
NEXT_PUBLIC_DOMAIN=https://dev-thanmaloanvu.vplay.vn
# NEXT_PUBLIC_SECRET_KEY=***
# NEXT_PUBLIC_FACEBOOK=https://facebook.com/vplay
# NEXT_PUBLIC_GROUP=https://facebook.com/groups/bag
# NEXT_PUBLIC_TIKTOK=https://tiktok.com
NEXT_PUBLIC_HUB=https://dev.vplay.vn/website-api
NEXT_PUBLIC_GAME_ID=23
NEXT_PUBLIC_WEBSHOP=https://dev.vplay.vn/webshop-api
NEXT_PUBLIC_OIDC=https://dev-id.onlive.vn/api-core/v2/oidc-service
NEXT_PUBLIC_ENV=development._SAID
NEXT_PUBLIC_APP_SERVICE_PATH=https://website-assets-cdn.vtvlive.vn/web-game/t018/images
NEXT_PUBLIC_API_SERVICE_GAME=https://dev-game-services-api.vplay.vn
```

### t018-than-ma-website/deploy/develop/deploy.yaml

```yaml
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
data:
  .env: |-
    NEXT_PUBLIC_API_BASE_URL=https://dev-thanmaloanvu-api.vplay.vn/api
    NEXT_PUBLIC_APP_CLIENT_ID=0cfe3f835b054b50
    NEXT_PUBLIC_APP_CLIENT_SECRET=***
    NEXT_PUBLIC_LOGIN_DOMAIN=https://dev-id.onlive.vn
    NEXT_PUBLIC_DOMAIN=https://dev-thanmaloanvu.vplay.vn
    # NEXT_PUBLIC_SECRET_KEY=***
    # NEXT_PUBLIC_FACEBOOK=https://facebook.com/vplay
    # NEXT_PUBLIC_GROUP=https://facebook.com/groups/bag
    # NEXT_PUBLIC_TIKTOK=https://tiktok.com
    NEXT_PUBLIC_HUB=https://dev.vplay.vn/website-api
    NEXT_PUBLIC_GAME_ID=23
    NEXT_PUBLIC_WEBSHOP=https://dev.vplay.vn/webshop-api
    NEXT_PUBLIC_OIDC=https://dev-id.onlive.vn/api-core/v2/oidc-service
    NEXT_PUBLIC_ENV=development._SAID
    NEXT_PUBLIC_APP_SERVICE_PATH=https://website-assets-cdn.vtvlive.vn/web-game/t018/images
    NEXT_PUBLIC_API_SERVICE_GAME=https://dev-game-services-api.vplay.vn
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  selector:
    matchLabels:
      service: ${SERVICE_NAME}
  replicas: 1
  template:
    metadata:
      labels:
        service: ${SERVICE_NAME}
        logger: nlog
      annotations:
    spec:
      terminationGracePeriodSeconds: 60
      containers:
        - name: ${SERVICE_NAME}
          image: ${IMAGE}
          ports:
            - containerPort: ${CONTAINER_PORT}
      nodeSelector:
      imagePullSecrets:
        - name: registry
      restartPolicy: Always
---
apiVersion: v1
kind: Service
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  ports:
    - port: ${CONTAINER_PORT}
      protocol: TCP
  selector:
    service: ${SERVICE_NAME}
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
  annotations:
    kubernetes.io/ingress.class: nginx
    #nginx.ingress.kubernetes.io/rewrite-target: /$2
spec:
  rules:
    - host: ${DOMAIN}
      http:
        paths:
          - path: ${SERVICE_PATH}
            pathType: Prefix
            backend:
              service:
                name: ${SERVICE_NAME}
                port:
                  number: ${CONTAINER_PORT}
```

### t018-than-ma-website/deploy/production/.env.example

```
NEXT_PUBLIC_API_BASE_URL=https://thanmaloanvu-api.vplay.vn/api
NEXT_PUBLIC_APP_CLIENT_ID=97158af7fd8e46f8
NEXT_PUBLIC_APP_CLIENT_SECRET=***
NEXT_PUBLIC_LOGIN_DOMAIN=https://id.onlive.vn
NEXT_PUBLIC_DOMAIN=https://thanmaaohoa.vplay.vn
# NEXT_PUBLIC_SECRET_KEY=***
# NEXT_PUBLIC_FACEBOOK=https://facebook.com/vplay
# NEXT_PUBLIC_GROUP=https://facebook.com/groups/bag
# NEXT_PUBLIC_TIKTOK=https://tiktok.com
NEXT_PUBLIC_HUB=https://vplay.vn/website-api
NEXT_PUBLIC_GAME_ID=23
NEXT_PUBLIC_WEBSHOP=https://vplay.vn/webshop-api
NEXT_PUBLIC_OIDC=https://id.onlive.vn/api-core/v2/oidc-service
NEXT_PUBLIC_ENV=development._SAID
NEXT_PUBLIC_APP_SERVICE_PATH=https://website-assets-cdn.vtvlive.vn/web-game/t018/images
NEXT_PUBLIC_API_SERVICE_GAME=https://game-services-api.vplay.vn
```

### t018-than-ma-website/deploy/production/deploy.yaml

```yaml
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
data:
  .env: |-
    NEXT_PUBLIC_API_BASE_URL=https://thanmaloanvu-api.vplay.vn/api
    NEXT_PUBLIC_APP_CLIENT_ID=97158af7fd8e46f8
    NEXT_PUBLIC_APP_CLIENT_SECRET=***
    NEXT_PUBLIC_LOGIN_DOMAIN=https://id.onlive.vn
    NEXT_PUBLIC_DOMAIN=https://thanmaaohoa.vplay.vn
    # NEXT_PUBLIC_SECRET_KEY=***
    # NEXT_PUBLIC_FACEBOOK=https://facebook.com/vplay
    # NEXT_PUBLIC_GROUP=https://facebook.com/groups/bag
    # NEXT_PUBLIC_TIKTOK=https://tiktok.com
    NEXT_PUBLIC_HUB=https://vplay.vn/website-api
    NEXT_PUBLIC_GAME_ID=23
    NEXT_PUBLIC_WEBSHOP=https://vplay.vn/webshop-api
    NEXT_PUBLIC_OIDC=https://id.onlive.vn/api-core/v2/oidc-service
    NEXT_PUBLIC_ENV=development._SAID
    NEXT_PUBLIC_APP_SERVICE_PATH=https://website-assets-cdn.vtvlive.vn/web-game/t018/images
    NEXT_PUBLIC_API_SERVICE_GAME=https://game-services-api.vplay.vn
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  selector:
    matchLabels:
      service: ${SERVICE_NAME}
  replicas: 3
  template:
    metadata:
      labels:
        service: ${SERVICE_NAME}
        logger: nlog
      annotations:
    spec:
      terminationGracePeriodSeconds: 60
      containers:
        - name: ${SERVICE_NAME}
          image: ${IMAGE}
          ports:
            - containerPort: ${CONTAINER_PORT}
      nodeSelector:
      imagePullSecrets:
        - name: registry
      restartPolicy: Always
---
apiVersion: v1
kind: Service
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  ports:
    - port: ${CONTAINER_PORT}
      protocol: TCP
  selector:
    service: ${SERVICE_NAME}
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
  annotations:
    kubernetes.io/ingress.class: nginx
    #nginx.ingress.kubernetes.io/rewrite-target: /$2
spec:
  rules:
    - host: ${DOMAIN}
      http:
        paths:
          - path: ${SERVICE_PATH}
            pathType: Prefix
            backend:
              service:
                name: ${SERVICE_NAME}
                port:
                  number: ${CONTAINER_PORT}
```

---

## thao-tung-tamquoc

### r005-fullweb-web/deploy/develop/.env.example

```
NEXT_PUBLIC_HUB=https://dev.vplay.vn/website-api
NEXT_PUBLIC_HUB_GAME_ID=1042
NEXT_PUBLIC_RANKING_API=https://sgpayvtvlive.jfungame.com
```

### r005-fullweb/Dockerfile

```dockerfile

FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
ARG BUILD_MODE
WORKDIR /vtvlive/src/app
COPY . .

#RUN dotnet restore "Affiliate API.csproj"

RUN dotnet build "R005-Web.csproj" -c $BUILD_MODE -o /app/build

FROM build AS publish
ARG BUILD_MODE
RUN dotnet publish "R005-Web.csproj" -c $BUILD_MODE -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS final
WORKDIR /app
EXPOSE 8080
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "R005-Web.dll"]
```

### r005-fullweb/Jenkinsfile

```groovy
@Library('jenkins-libs') _
VTVLiveVplayNetcoreautodev(domain:"thaotungtamquoc.vplay.vn ",container_port:"8080",service_path:"/",namespace:"vplay",service_name:"r005-thao-tung-tam-quoc")
```

### r005-fullweb/deploy/develop/deploy.yaml

```yaml
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
data:
  appsettings.json: |-
    {
      "ConnectionStrings": {
        "DefaultConnection": "Server=10.53.10.244;Database=R005_Thaotungtamquoc;User Id=R005_Thaotungtamquoc;Password=***;MultipleActiveResultSets=true;TrustServerCertificate=True",
        "TranInputConnection": "Server=10.53.10.244;Database=TranInput_REP; User Id=t022;Password=***;MultipleActiveResultSets=true;TrustServerCertificate=True"
      },
      "SiteSettings": {
        "AppId": "1042",
        "AppName": "R005 - Thao tung tam quoc",
        "AppClientId": "0cfe3f835b054b50",
        "AppClientSecret": "***",
        "HubUrl": "https://dev.vplay.vn/website-api",
        "WebShopUrl": "https://dev.vplay.vn/webshop-api",
        "OidcUrl": "https://dev-id.onlive.vn/api-core/v2/oidc-service/oauth2",
        "PublicUrl": "https://dev-thaotungtamquoc.vplay.vn",
        "ServiceUrl": "https://dev-game-services-api.vplay.vn/api",
        "SecretKey": "***",
        "LimitReportDays": 365,
        "Environment": "Localhost",
        "RankingApiUrl": "https://sgpayvtvlive.jfungame.com/VTVLiveGetRankList.php"
      },
      "RedisSettings": {
        "ConnectionString": "10.54.10.64:6379",
        "Prefix": "R005_Local:"
      },
      "Logging": {
        "LogLevel": {
          "Default": "Information",
          "Microsoft.AspNetCore": "Warning"
        }
      },
      "AllowedHosts": "*"
    }


---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  selector:
    matchLabels:
      service: ${SERVICE_NAME}
  replicas: 1
  template:
    metadata:
      labels:
        service: ${SERVICE_NAME}
        logger: nlog
      annotations:
    spec:
      terminationGracePeriodSeconds: 60
      containers:
      - name: ${SERVICE_NAME}
        image: ${IMAGE}
        env:
        - name: TZ
          value: Etc/GMT-7
        - name: ASPNETCORE_ENVIRONMENT
          value: Development
        ports:
        - containerPort: ${CONTAINER_PORT}
        volumeMounts:
          - name: ${SERVICE_NAME}
            mountPath: /app/appsettings.json
            subPath: appsettings.json
      nodeSelector:
      imagePullSecrets:
      - name: registry
      restartPolicy: Always
      volumes:
      - name: ${SERVICE_NAME}
        configMap:
          name: ${SERVICE_NAME}
---
apiVersion: v1
kind: Service
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  ports:
  - port: ${CONTAINER_PORT}
    protocol: TCP
  selector:
    service: ${SERVICE_NAME}
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name:  ${SERVICE_NAME}
  namespace: ${NAMESPACE}
  annotations:
    kubernetes.io/ingress.class: nginx
    # nginx.ingress.kubernetes.io/rewrite-target: /$2
spec:
  rules:
  - host: ${DOMAIN}
    http:
      paths:
      - path: ${SERVICE_PATH}
        pathType: Prefix
        backend:
          service:
            name: ${SERVICE_NAME}
            port:
              number: ${CONTAINER_PORT}
```

### r005-fullweb/deploy/production/deploy.yaml

```yaml
---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  dataFrom:
    - extract:
        key: ***
  refreshInterval: 15s
  secretStoreRef:
    kind: ClusterSecretStore
    name: secretstore-vplay
  target:
    name: ${SERVICE_NAME}

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  selector:
    matchLabels:
      service: ${SERVICE_NAME}
  replicas: 1
  template:
    metadata:
      labels:
        service: ${SERVICE_NAME}
        logger: nlog
      annotations:
        reloader.stakater.com/auto: "true"
    spec:
      terminationGracePeriodSeconds: 60
      containers:
      - name: ${SERVICE_NAME}
        image: ${IMAGE}
        env:
        - name: TZ
          value: Etc/GMT-7
        - name: ASPNETCORE_ENVIRONMENT
          value: Development
        ports:
        - containerPort: ${CONTAINER_PORT}
        volumeMounts:
          - name: ${SERVICE_NAME}
            mountPath: /app/appsettings.json
            subPath: appsettings.json
      nodeSelector:
      imagePullSecrets:
      - name: registry
      restartPolicy: Always
      volumes:
      - name: ${SERVICE_NAME}
        secret:
         secretName: ${SERVICE_NAME}
---
apiVersion: v1
kind: Service
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  ports:
  - port: ${CONTAINER_PORT}
    protocol: TCP
  selector:
    service: ${SERVICE_NAME}
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name:  ${SERVICE_NAME}
  namespace: ${NAMESPACE}
  annotations:
    kubernetes.io/ingress.class: nginx
    # nginx.ingress.kubernetes.io/rewrite-target: /$2
spec:
  rules:
  - host: ${DOMAIN}
    http:
      paths:
      - path: ${SERVICE_PATH}
        pathType: Prefix
        backend:
          service:
            name: ${SERVICE_NAME}
            port:
              number: ${CONTAINER_PORT}
```

---

## thoi-khong-chi-mong

### t022-web-web/deploy/develop/.env.example

_Giống hệt `quy-mon-quan/homepage-va-conhan-web/deploy/develop/.env.example`._

### t022-web/Dockerfile

```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
#ARG BUILD_MODE
WORKDIR /vtvlive/src/app
COPY . .
RUN dotnet build "T022 Web.csproj" -o /app/build

FROM build AS publish
ARG BUILD_MODE
RUN dotnet publish "T022 Web.csproj" -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS final
WORKDIR /app
EXPOSE 8080
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "T022 Web.dll"]
```

### t022-web/Jenkinsfile

```groovy
@Library('jenkins-libs') _
VTVLiveVplayNetcoreautodev(domain:"thoikhongchimong.vplay.vn",container_port:"8080",service_path:"/",namespace:"vplay",service_name:"t022-thoikhongchimong-web")
```

### t022-web/deploy/develop/deploy.yaml

_Giống hệt `quy-mon-quan/homepage-va-conhan/deploy/develop/deploy.yaml`._

### t022-web/deploy/production/deploy.yaml

_Giống hệt `quy-mon-quan/homepage-va-conhan/deploy/production/deploy.yaml`._

---

## tuyetdinh-chiengioi

### t032-home-page/Dockerfile

_Giống hệt `phuong-hoang-tru-tien/home-page/Dockerfile`._

### t032-home-page/Jenkinsfile

```groovy
@Library('jenkins-libs') _
VTVliveVplayNodeJSautodev(domain:"tuyetdinhchiengioi.vplay.vn",container_port:"3000",service_path:"/",namespace:"vplay",service_name:"t032-homepage")
```

### t032-home-page/deploy/develop/.env.example

```
VITE_APP_GAME_NAME=T032
VITE_APP_CLIENT_ID=0cfe3f835b054b50
VITE_APP_CLIENT_SECRET=***
VITE_APP_LOGIN_DOMAIN=https://dev-id.onlive.vn
VITE_APP_DOMAIN=https://dev-tuyetdinhchiengioi.vplay.vn
VITE_APP_HUB=https://dev.vplay.vn/website-api
VITE_APP_GAME_ID=41
VITE_APP_OIDC=https://dev-id.onlive.vn/api-core/v2/oidc-service
VITE_APP_ENV=development._SAID

VITE_APP_REDIRECT_URL=/callback
VITE_APP_API_GAME_SERVICES=https://dev-game-services-api.vplay.vn/api

# VITE_APP_ENV=server

VITE_APP_CDN_IMAGE=''
VITE_APP_CLUB=https://club.onlive.vn
```

### t032-home-page/deploy/develop/deploy.yaml

```yaml
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
data:
  .env: |-
    VITE_APP_GAME_NAME=T032
    VITE_APP_CLIENT_ID=0cfe3f835b054b50
    VITE_APP_CLIENT_SECRET=***
    VITE_APP_LOGIN_DOMAIN=https://dev-id.onlive.vn
    VITE_APP_DOMAIN=https://dev-tuyetdinhchiengioi.vplay.vn
    VITE_APP_HUB=https://dev.vplay.vn/website-api
    VITE_APP_GAME_ID=41
    VITE_APP_OIDC=https://dev-id.onlive.vn/api-core/v2/oidc-service
    VITE_APP_ENV=development._SAID

    VITE_APP_REDIRECT_URL=/callback
    VITE_APP_API_GAME_SERVICES=https://dev-game-services-api.vplay.vn/api
    VITE_APP_CDN_IMAGE=''
    VITE_APP_CLUB=https://club.onlive.vn

---
apiVersion: apps/v1
kind: Deployment

metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}

spec:
  selector:
    matchLabels:
      service: ${SERVICE_NAME}

  replicas: 1

  template:
    metadata:
      labels:
        service: ${SERVICE_NAME}
        logger: nlog

    spec:
      terminationGracePeriodSeconds: 60

      containers:
        - name: ${SERVICE_NAME}
          image: ${IMAGE}

          env:
            - name: TZ
              value: Etc/GMT-7

          ports:
            - containerPort: ${CONTAINER_PORT}

          volumeMounts:
            - name: ${SERVICE_NAME}
              mountPath: /usr/src/app/.env
              subPath: .env   

      imagePullSecrets:
        - name: registry
      restartPolicy: Always
      volumes:
        - name: ${SERVICE_NAME}
          configMap:
            name: ${SERVICE_NAME}

---
apiVersion: v1
kind: Service
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  ports:
    - port: ${CONTAINER_PORT}
      protocol: TCP
  selector:
    service: ${SERVICE_NAME}
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
  annotations:
    kubernetes.io/ingress.class: nginx
spec:
  rules:
    - host: ${DOMAIN}
      http:
        paths:
          - path: ${SERVICE_PATH}
            pathType: Prefix
            backend:
              service:
                name: ${SERVICE_NAME}
                port:
                  number: ${CONTAINER_PORT}
      http:
        paths:
          - path: ${SERVICE_PATH}
            pathType: Prefix
            backend:
              service:
                name: ${SERVICE_NAME}
                port:
                  number: ${CONTAINER_PORT}
```

### t032-home-page/deploy/production/.env.example

```
VITE_APP_GAME_NAME=T032
VITE_APP_CLIENT_ID=97158af7fd8e46f8
VITE_APP_CLIENT_SECRET=***
VITE_APP_LOGIN_DOMAIN=https://id.onlive.vn
VITE_APP_DOMAIN=https://dev-tuyetdinhchiengioi.vplay.vn
VITE_APP_HUB=https://vplay.vn/website-api
VITE_APP_GAME_ID=41
VITE_APP_OIDC=https://id.onlive.vn/api-core/v2/oidc-service
VITE_APP_ENV=_SAID

VITE_APP_REDIRECT_URL=/callback
VITE_APP_API_GAME_SERVICES=https://game-services-api.vplay.vn/api

# VITE_APP_ENV=server

VITE_APP_CDN_IMAGE=''
VITE_APP_CLUB=https://club.onlive.vn
```

### t032-home-page/deploy/production/deploy.yaml

```yaml

---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
data:
  .env: |-
    VITE_APP_GAME_NAME=T032
    VITE_APP_CLIENT_ID=97158af7fd8e46f8
    VITE_APP_CLIENT_SECRET=***
    VITE_APP_LOGIN_DOMAIN=https://id.onlive.vn
    VITE_APP_DOMAIN=https://dev-tuyetdinhchiengioi.vplay.vn
    VITE_APP_HUB=https://vplay.vn/website-api
    VITE_APP_GAME_ID=41
    VITE_APP_OIDC=https://id.onlive.vn/api-core/v2/oidc-service
    VITE_APP_ENV=_SAID

    VITE_APP_REDIRECT_URL=/callback
    VITE_APP_API_GAME_SERVICES=https://game-services-api.vplay.vn/api
    VITE_APP_CDN_IMAGE=''
    VITE_APP_CLUB=https://club.onlive.vn

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  selector:
    matchLabels:
      service: ${SERVICE_NAME}
  replicas: 1
  template:
    metadata:
      labels:
        service: ${SERVICE_NAME}
        logger: nlog
      annotations:
    spec:
      terminationGracePeriodSeconds: 60
      containers:
        - name: ${SERVICE_NAME}
          image: ${IMAGE}
          env:
            - name: TZ
              value: Etc/GMT-7
          ports:
            - containerPort: ${CONTAINER_PORT}
          volumeMounts:
            - name: ${SERVICE_NAME}
              mountPath: /usr/src/app/.env
              subPath: .env 

      imagePullSecrets:
        - name: registry
      volumes:
        - name: ${SERVICE_NAME}
          configMap:
            name: ${SERVICE_NAME}
      restartPolicy: Always
---
apiVersion: v1
kind: Service
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  ports:
    - port: ${CONTAINER_PORT}
      protocol: TCP
  selector:
    service: ${SERVICE_NAME}
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${SERVICE_NAME}
  namespace: ${NAMESPACE}
  annotations:
    kubernetes.io/ingress.class: nginx
spec:
  rules:
    - host: ${DOMAIN}
      http:
        paths:
          - path: ${SERVICE_PATH}
            pathType: Prefix
            backend:
              service:
                name: ${SERVICE_NAME}
                port:
                  number: ${CONTAINER_PORT}
      http:
        paths:
          - path: ${SERVICE_PATH}
            pathType: Prefix
            backend:
              service:
                name: ${SERVICE_NAME}
                port:
                  number: ${CONTAINER_PORT}
```
