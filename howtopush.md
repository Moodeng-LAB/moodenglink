# 🚀 How to push & release Moodenglink

คู่มือสั้นๆ ว่าเปลี่ยนโค้ดแล้ว push ยังไง และปล่อยเวอร์ชันใหม่ขึ้น npm ยังไง

---

## 1. Workflow ปกติ (แก้โค้ด → push)

```bash
# 1. แตก branch จาก main (อย่า commit ตรงเข้า main)
git checkout main && git pull
git checkout -b feat/ชื่อฟีเจอร์

# 2. แก้โค้ดใน src/ ...

# 3. เช็คให้ผ่านก่อน commit (สำคัญ)
npm run format        # จัดฟอร์แมตด้วย prettier
npx tsc --noEmit      # type-check
npm test              # รันเทสต์
npm run build         # อัปเดต dist/ (committed ไปด้วย)

# 4. commit + push
git add -A
git commit -m "feat: อธิบายสั้นๆ ว่าทำอะไร"
git push -u origin feat/ชื่อฟีเจอร์
```

จากนั้นเปิด Pull Request บน GitHub แล้ว merge เข้า `main`

> **ทำไมต้อง `npm run build`?** `dist/` ถูก commit ไว้ในรีโป (เพื่อให้ `bun add github:…`
> ติดตั้งได้โดยไม่ต้อง build) ถ้าลืม build CI (`build.yml`) จะ build ให้แล้ว commit
> `dist` กลับมาให้เอง แต่ build เองก่อนจะชัวร์กว่า

---

## 2. ปล่อยเวอร์ชันใหม่ขึ้น npm (ใช้ Changesets)

รีลีสทั้งหมดขับเคลื่อนด้วย [Changesets](https://github.com/changesets/changesets)
**ห้ามแก้เลข version ใน `package.json` เอง** — ให้ changesets จัดการ

### ขั้นที่ 1 — เขียน changeset คู่กับการแก้โค้ด

```bash
npm run changeset
```

จะถามว่า:

- **bump แบบไหน?**
  - `patch` → แก้บั๊ก / เปลี่ยนเล็กน้อย (1.0.0 → 1.0.**1**)
  - `minor` → เพิ่มฟีเจอร์ใหม่ที่ไม่ทำของเดิมพัง (1.0.0 → 1.**1**.0)
  - `major` → เปลี่ยนแบบ breaking (1.0.0 → **2**.0.0)
- **สรุปการเปลี่ยนแปลง** → เขียนสั้นๆ (จะไปโผล่ใน CHANGELOG)

มันจะสร้างไฟล์ `.changeset/ชื่อสุ่มๆ.md` — **commit ไฟล์นี้ไปกับ PR ด้วย**

### ขั้นที่ 2 — merge เข้า main → บอตเปิด "Version PR" ให้

พอ changeset ไปถึง `main` แล้ว workflow `Release` จะเปิด (หรืออัปเดต) PR ชื่อ
**"chore: version packages"** อัตโนมัติ — PR นี้จะ:

- bump เลขใน `package.json`
- อัปเดต `CHANGELOG.md`
- ลบไฟล์ changeset ที่ใช้ไปแล้ว

### ขั้นที่ 3 — merge Version PR → publish อัตโนมัติ

พอ merge PR "chore: version packages" เข้า `main`:

- workflow รัน `changeset publish` → **push ขึ้น npm ให้เอง** + สร้าง git tag

เสร็จ 🎉 เช็คได้ที่ <https://www.npmjs.com/package/moodenglink>

---

## 3. ปล่อยแบบ manual (เผื่อ CI มีปัญหา)

ถ้าอยาก publish จากเครื่องเอง:

```bash
git checkout main && git pull   # ต้องอยู่ main ที่สะอาด (version ถูก bump แล้ว)
npm publish --access public
```

> ต้อง `npm login` ก่อน หรือใช้ token:
> `npm publish --access public --//registry.npmjs.org/:_authToken=npm_xxxx`

---

## 4. สิ่งที่ต้องตั้งครั้งเดียว (repo admin)

| อะไร | ที่ไหน |
| --- | --- |
| **`NPM_TOKEN`** secret (ชนิด Automation หรือ Granular RW) | Settings → Secrets and variables → Actions → **Repository** secrets (ไม่ใช่ Environment!) |
| เปิด **"Allow GitHub Actions to create and approve pull requests"** | Settings → Actions → General → Workflow permissions |

> ถ้าไม่เปิดข้อ 2 บอตจะ push branch `changeset-release/main` ได้แต่เปิด PR ไม่ได้ —
> ต้อง merge branch นั้นเข้า main เอง

---

## สรุปคำสั่งที่ใช้บ่อย

| อยากทำ | คำสั่ง |
| --- | --- |
| จัดฟอร์แมต | `npm run format` |
| type-check | `npx tsc --noEmit` |
| รันเทสต์ | `npm test` |
| build dist | `npm run build` |
| เขียน changeset | `npm run changeset` |
| publish เอง | `npm publish --access public` |
