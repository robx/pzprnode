mask-horiz.png: white.png
	convert white.png \
		-alpha set -channel A \
		-sparse-color Barycentric \
			'%[fx:w*2/3],0 opaque %[fx:w+0.5],0 transparent' \
		mask-horiz.png

mask-vert.png: white.png
	convert white.png \
		-alpha set -channel A \
		-sparse-color Barycentric \
			'0,%[fx:h*2/3] opaque 0,%[fx:h+0.5] transparent' \
		mask-vert.png
