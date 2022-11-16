{
  description = "pzprnode";

  inputs.flake-utils.url = github:numtide/flake-utils;
  inputs.nixpkgs.url = github:NixOS/nixpkgs/nixpkgs-unstable;
  inputs.pzprjs.url = github:robx/pzprjs;

  outputs = {
    self,
    flake-utils,
    nixpkgs,
    pzprjs,
  }:
    flake-utils.lib.eachDefaultSystem (
      system: let
        pkgs = import nixpkgs {inherit system;};
      in {
        defaultPackage = pkgs.callPackage ./nix/pzprnode.nix {
          pzprjs = pzprjs.defaultPackage.${system};
        };
      }
    );
}
