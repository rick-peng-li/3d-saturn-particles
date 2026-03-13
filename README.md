# 土星粒子交互系统 (Saturn Particle Interaction System)

## � 项目简介
这是一个基于 **WebGL (Three.js)** 和 **计算机视觉 (MediaPipe)** 打造的实时 3D 粒子交互艺术项目。
项目通过数万个粒子构建了一个宏大的土星环系统，并利用开普勒定律模拟真实的物理轨道运动。用户可以通过简单的手势（张开或握紧手掌）与宇宙进行对话，体验从宏观秩序到微观混沌的视觉震撼。

### ✨ 核心功能
1.  **👋 实时手势交互**
    -   利用 MediaPipe Hands 实现无接触式操控。
    -   **张开手掌 (🖐️)**：拉近镜头，粒子亮度急剧提升，感受恒星般的炽热。
    -   **握紧手掌 (✊)**：拉远镜头，回归宁静的深空观测视角。

2.  **🪐 物理直觉模拟**
    -   **开普勒轨道**：粒子运行遵循开普勒第三定律，内圈粒子公转速度快于外圈，呈现真实的流体感。
    -   **动态光影**：引入电影级 Bloom（辉光）后处理效果，亮度随距离呈非线性变化（平方反比律模拟）。

3.  **💥 混沌临界体验**
    -   当观测距离突破临界点（极近距离）时，系统进入**混沌模式**。
    -   粒子将打破原有引力束缚，叠加高频布朗运动与爆炸效果，模拟微观粒子层面的无序与狂热。

## � 技术栈
-   **Frontend**: Native HTML5, CSS3, JavaScript (ES6+)
-   **3D Engine**: Three.js (WebGL) + PostProcessing (Bloom Effect)
-   **AI / CV**: Google MediaPipe Hands (手势识别)
-   **DevOps**: Docker, Nginx

## 🚀 Docker 启动指南 (推荐)
本项目已完全容器化，这是最简单、最稳定的运行方式。

1.  确保您的电脑已安装并启动 **Docker Desktop**。
2.  在项目根目录下打开终端（Terminal / PowerShell），执行以下命令：
    ```bash
    docker-compose up -d --build
    ```
3.  等待镜像构建及容器启动完成。
4.  打开浏览器访问：[http://localhost:3000](http://localhost:3000)

## � 本地开发指南 (非 Docker)
如果您希望在本地直接运行源码（需自备 HTTP 服务环境）：

1.  进入前端目录：
    ```bash
    cd frontend
    ```
2.  启动一个本地 HTTP 服务器。
    > ⚠️ **注意**：由于浏览器安全策略（CORS）和 ES Module 限制，**严禁**直接双击 `.html` 文件打开，必须使用 HTTP 服务器。

    -   **使用 Node.js (推荐)**:
        ```bash
        # 如果未安装 serve，可使用 npx 临时运行
        npx serve .
        ```
    -   **使用 Python**:
        ```bash
        python -m http.server 3000
        ```
3.  打开浏览器访问对应地址（例如 http://localhost:3000）。

## 🔗 服务地址
-   **Frontend**: [http://localhost:3000](http://localhost:3000)

## ⚠️ 关于直接访问 (file://)
**请勿直接双击 `index.html` 文件打开！**

由于本项目包含**摄像头权限调用**、**AI 模型加载**以及**3D 纹理渲染**，浏览器的安全沙箱策略（CORS 和 Secure Context）会阻止这些功能在本地文件协议（file://）下运行。

**后果**：
-   摄像头无法启动
-   手势识别模型无法加载
-   画面黑屏或报错

请务必使用上述的 **Docker** 或 **本地 HTTP 服务器** 方式启动。
