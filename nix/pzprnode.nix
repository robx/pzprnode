{
  stdenv,
  nodejs,
  makeWrapper,
  pzprjs,
  graphicsmagick,
  librsvg,
  lib,
}: stdenv.mkDerivation {
    name = "pzprnode";
    src = ../.;

    outputs = ["out"];
    phases = [ "unpackPhase" "installPhase" ];
    nativeBuildInputs = [ makeWrapper ];

    installPhase = ''
      runHook preInstall

      mkdir -p "$out/share"
      cp built/pzprnode.js $out/share/
      cp -r img $out/share/
      cp -r templates $out/share/

      mkdir -p $out/share/node_modules
      cp -r "${pzprjs}/" $out/share/node_modules/pzpr

      makeWrapper "${nodejs}/bin/node" "$out/bin/pzprnode" \
        --set PATH ${lib.makeBinPath [ librsvg graphicsmagick ]} \
        --chdir "$out/share" \
        --add-flags "$out/share/pzprnode.js"

      runHook postInstall
    '';
  }
