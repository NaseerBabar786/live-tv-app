# Smooth motion (RIFE x2, open model) + sharpen (Real-ESRGAN) one clip: out/$ONLY-src.mp4 -> out/$ONLY-hd.mp4
set -eux
sudo apt-get install -y -qq mesa-vulkan-drivers libvulkan1 unzip >/dev/null
pip install -q torch torchvision --index-url https://download.pytorch.org/whl/cpu
pip install -q spandrel
curl -fsSL -o rg.pth https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-general-x4v3.pth
curl -fsSL -o rife.zip https://github.com/nihui/rife-ncnn-vulkan/releases/download/20221029/rife-ncnn-vulkan-20221029-ubuntu.zip
unzip -q rife.zip -d rife; R=$(dirname $(find rife -name rife-ncnn-vulkan -type f)); chmod +x $R/rife-ncnn-vulkan
rm -rf f0 f1 f2; mkdir -p f0 f1
ffmpeg -v error -i out/$ONLY-src.mp4 -vf "crop=iw:floor(ih*0.975/2)*2:0:0" f0/%05d.png
n=$(ls f0 | wc -l)
if (cd $R && ./rife-ncnn-vulkan -i ../../f0 -o ../../f1 -m rife-v4.6 -n $((n*2)) -g -1 -j 1:2:2) ; then FPS=32; else rm -rf f1; mkdir f1; cp f0/* f1/; FPS=16; fi
ls f1 | head -2; ls f1 | wc -l
python3 upscale.py f1 f2
ffmpeg -v error -y -framerate $FPS -i f2/%08d.png -i out/$ONLY-src.mp4 -map 0:v -map 1:a? -c:v libx264 -crf 14 -preset slow -pix_fmt yuv420p -c:a aac out/$ONLY-hd.mp4 \
 || ffmpeg -v error -y -framerate $FPS -pattern_type glob -i 'f2/*.png' -i out/$ONLY-src.mp4 -map 0:v -map 1:a? -c:v libx264 -crf 14 -preset slow -pix_fmt yuv420p -c:a aac out/$ONLY-hd.mp4
