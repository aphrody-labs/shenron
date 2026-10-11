import os
from rapidocr_onnxruntime import RapidOCR

ocr = RapidOCR()
paths = [
    "/mnt/c/Users/omara/Desktop/trucmuch/goku solo test/1 DragonWorld/Canon/toriyama implication/Cooler_par_toriyama.webp",
    "/mnt/c/Users/omara/Desktop/trucmuch/goku solo test/1 DragonWorld/Canon/toriyama implication/Cooler_tokusentai_par_Toriyama.webp",
    "/mnt/c/Users/omara/Desktop/trucmuch/goku solo test/1 DragonWorld/Canon/Canon Film/CoolerAndroid19OthersGT.webp",
    "/mnt/c/Users/omara/Desktop/trucmuch/goku solo test/2 Force calcul/7 Saga Film Puissance/Cooler files/Capture d'écran 2026-07-24 210436.png",
    "/mnt/c/Users/omara/Desktop/trucmuch/goku solo test/1 DragonWorld/Canon/Canon Film/dimension canon.png",
    "/mnt/c/Users/omara/Desktop/trucmuch/goku solo test/1 DragonWorld/Canon/Canon Film/igiuguui.png"
]

for p in paths:
    if os.path.exists(p):
        res, _ = ocr(p)
        text = " ".join([r[1] for r in res]) if res else "[NO TEXT]"
        print("===", os.path.basename(p), "===")
        print(text[:300])
        print()
    else:
        print("NOT FOUND:", p)
