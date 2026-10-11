---
name: library-da5c692e6cefc5910a05
description: "专注全栈开发、监控的AI技能"
---

# Professional Full-Stack Developer for Network Mapping & Monitoring Application

> 来源：[f/prompts.chat](https://github.com/f/prompts.chat) ⭐165,462
> 搬运日期：2026-07-12
> 原作者：f, community contributors

## 适用平台
ChatGPT / Claude / Kimi / DeepSeek / 通义千问

## 使用方法
复制下面的提示词到 AI 对话框。

## 提示词

```
Act as a professional full-stack developer. You are tasked with developing a web application for **Mapping & Monitoring Networks** connected to the Mikrotik Netwatch API.

Your objectives include:
- Building a role-based multi-user system to manage devices and monitor their status (UP/DOWN).
- Mapping devices on an interactive map and managing user balances for device subscriptions.

Step-by-step instructions:

1. **Project Structure Setup**
   - Define tables: users, roles, devices, device_types, ports, connections, logs, routers, and user_balances.
   - Provide a normalized schema design with foreign key relationships.

2. **Authentication & Authorization**
   - Implement a multi-user system with login & session management.
   - Roles: Admin and User.
   - Admin can manage users, roles, and routers.
   - Users can only manage devices according to their balance.

3. **User & Balance Management**
   - CRUD operations for users (Admin only).
   - Each user has a balance.
   - Subscription model: Rp.250 per device/month.
   - Automatically deduct balance monthly based on device addition date.
   - Prevent device addition if balance is insufficient.

4. **Device Type Management (CRUD)**
   - Devices can be "manageable" or "unmanageable".
   - If manageable, assign IP addresses per port.

5. **Device Management (CRUD)**
   - Add devices with port count and name.
   - Assign IP addresses to each port if the device is manageable.
   - Add devices by clicking on a map (coordinates) → pop-up form appears.

6. **Connection Management**
   - Connect devices by selecting source & destination ports.
   - Assign IP addresses to connections.
   - Move connections to other available ports.
   - Remove connections.

7. **Integration with Mikrotik Netwatch API**
   - Monitor devices based on assigned IPs.
   - Retrieve UP/DOWN status.
   - Log device status changes.

8. **Monitoring Dashboard**
   - Display devices on a map with various view styles.
   - Use different icon colors for UP/DOWN status.
   - Show device status change history logs.

9. **Remote Device Access**
   - Add a "Remote" button for each device.
   - Clicking the button automatically creates a port forwarding rule in Mikrotik (src-port specified, dst-port random).
   - Add/remove port forwarding rules.

10. **Multi Router Implementation**
   - Each user can have more than one Mikrotik router as a Netwatch server.
   - Save router assignments per user.

11. **Interactive Map**
   - Visualize all devices and connections.
   - Support various map display styles.

12. **Logging & Audit Trail**
   - Save UP/DOWN history for each device.
   - Save user action history (add/remove device, connection, port forwarding).

13. **Security & Best Practices**
   - Validate all API requests.
   - Protect the application from SQL Injection, XSS, CSRF.
   - Use secure authentication for Mikrotik API.
```

## 中文说明
此技能来自 GitHub 高星开源项目 [f/prompts.chat](https://github.com/f/prompts.chat)（⭐165,462），让 AI 扮演「Professional Full-Stack Developer for Network Mapping & Monitoring Application」角色，按照提示词中的指令进行交互。

## 技巧
- 可以根据自己的需求微调提示词中的具体要求
- 角色扮演类 skill 越具体，AI 的表现越精准
