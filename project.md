# Louvo — Project Description

**Louvo** is a mobile app that allows users to explore, customize, and virtually try different hairstyles before getting a haircut. Users upload a photo, select their gender and hairstyle category, browse available styles, customize options such as hair length, fade level, hair color, and volume, and then generate a realistic preview of themselves with the selected hairstyle.

The app will also allow users to **compare before-and-after results, save their favorite looks, share them, and discover additional hairstyle recommendations**.

## Core Experience

A key part of Louvo is the hairstyle browsing experience. Instead of using photos of real people to represent each hairstyle, Louvo will use **neutral, faceless mannequin-style characters** similar to the reference image. These mannequins will have:

* No facial features
* No identifiable ethnicity
* Neutral skin/face styling
* Male and female versions
* Hair specifically designed to showcase each hairstyle
* Consistent visual style across the entire hairstyle catalog

This allows users to focus on the **haircut itself**, rather than the appearance of the person modeling it.

The mannequin images will be generated using an **AI image-generation system** and stored as assets in the application or database. Each hairstyle will reference its corresponding mannequin images, allowing the hairstyle catalog to be easily updated, replaced, or expanded without changing the application logic.

The system should be designed so that **new hairstyles and mannequin images can be added or replaced easily without requiring an app update**.

## Technology Stack

### Mobile App

* **React Native** — Cross-platform mobile development for both iOS and Android
* **Expo** — Development, testing, and deployment workflow

### AI Image Generation

* **Fal.ai** — Used to generate the personalized hairstyle previews
* AI-generated mannequin images will also be created for the hairstyle catalog

### Backend

* **Node.js / API server**
* **Railway** — Backend server and database hosting

## Overall Goal

The goal of Louvo is to make choosing a haircut **simple, visual, and low-risk** by allowing users to see what different hairstyles could look like on them before they visit a barber or hairstylist.
